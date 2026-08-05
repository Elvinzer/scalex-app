import {
  YOUTUBE_ANALYTICS_API_BASE,
  YOUTUBE_ANALYTICS_BATCH_SIZE,
  YOUTUBE_DATA_API_BASE,
  YOUTUBE_MAX_BACKFILL_VIDEOS,
  YOUTUBE_REQUEST_RETRY_DELAY_MS,
  YOUTUBE_TOKEN_URL,
} from "./protocol";

// Thin server-only HTTP client for the YouTube Data API v3 + Analytics API.
// Auth is the channel's own OAuth token (obtained via app/api/youtube/
// {connect,callback}), decrypted at the call site, never logged — same rule
// as every other BYOK/OAuth integration in this codebase.

const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ApiResponse = { status: number; body: unknown };

async function request(url: URL, init?: { method?: string; headers?: Record<string, string>; body?: URLSearchParams }): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.headers,
      body: init?.body,
      signal: controller.signal,
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Google's API error envelope is { error: { code, message, errors: [{
// reason, message }] } } — pulling the reason/message out (never anything
// from the request itself) turns a bare "status 403" into something
// actionable in server logs, e.g. "accessNotConfigured: YouTube Data API v3
// has not been used in project ... before or it is disabled" (the project's
// API not enabled in Google Cloud Console — the most common first-connect
// failure) vs. "insufficientPermissions" (missing scope) vs.
// "quotaExceeded".
function describeApiError(body: unknown): string {
  const error = asRecord(asRecord(body)?.error);
  if (!error) return "no error body";
  const reason = str(asRecord(Array.isArray(error.errors) ? error.errors[0] : null)?.reason);
  const message = str(error.message);
  return [reason, message].filter(Boolean).join(": ") || "unrecognized error shape";
}

// The OAuth token endpoint (YOUTUBE_TOKEN_URL) uses the plain OAuth2 error
// shape { error: "invalid_grant", error_description: "..." }, distinct from
// describeApiError's Google API envelope above.
function describeOAuthError(body: unknown): string {
  const rec = asRecord(body);
  if (!rec) return "no error body";
  const error = str(rec.error);
  const description = str(rec.error_description);
  return [error, description].filter(Boolean).join(": ") || "unrecognized error shape";
}

// Thrown when the connected account has no YouTube channel at all (a Google
// account that never created one) — the one actionable failure mode this
// integration needs to surface clearly, same role as
// InstagramNotProfessionalAccountError.
export class YoutubeChannelNotFoundError extends Error {
  constructor() {
    super("Aucune chaîne YouTube n'est associée à ce compte Google.");
    this.name = "YoutubeChannelNotFoundError";
  }
}

export type TokenExchangeResult = { accessToken: string; refreshToken: string | null; expiresInSeconds: number };

// Step 1 of the OAuth callback: exchanges the authorization `code` for an
// access token (~1h) + a refresh token — the refresh token is only present
// when Google actually issues one (see protocol.ts's prompt=consent note).
export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code,
  });
  const { status, body: resBody } = await request(new URL(YOUTUBE_TOKEN_URL), { method: "POST", body });
  const rec = asRecord(resBody) ?? {};
  const accessToken = str(rec.access_token);
  const expiresInSeconds = num(rec.expires_in);
  if (status < 200 || status >= 300 || !accessToken || expiresInSeconds === null) {
    throw new Error(`YouTube code exchange failed (status ${status}): ${describeOAuthError(resBody)}`);
  }
  return { accessToken, refreshToken: str(rec.refresh_token), expiresInSeconds };
}

export type AccessTokenResult = { accessToken: string; expiresInSeconds: number };

// Thrown when Google rejects the refresh token itself (revoked by the user,
// or expired from ~6 months of inactivity) — the one case that requires a
// full reconnect, not just a retry. Distinguished from a transient failure
// so callers can set initialSyncStatus="token_expired" the same way
// Instagram does when its long-lived token fully expires.
export class YoutubeTokenRevokedError extends Error {
  constructor() {
    super("La connexion Google a été révoquée ou a expiré — reconnecte YouTube.");
    this.name = "YoutubeTokenRevokedError";
  }
}

// Refreshes the access token via the long-lived refresh token — called on
// every sync (see protocol.ts), not on a days-long margin like Instagram.
export async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<AccessTokenResult> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const { status, body: resBody } = await request(new URL(YOUTUBE_TOKEN_URL), { method: "POST", body });
  const rec = asRecord(resBody) ?? {};
  if (status === 400 && str(rec.error) === "invalid_grant") {
    throw new YoutubeTokenRevokedError();
  }
  const accessToken = str(rec.access_token);
  const expiresInSeconds = num(rec.expires_in);
  if (status < 200 || status >= 300 || !accessToken || expiresInSeconds === null) {
    throw new Error(`YouTube token refresh failed (status ${status}): ${describeOAuthError(resBody)}`);
  }
  return { accessToken, expiresInSeconds };
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export type YoutubeChannel = {
  channelId: string;
  title: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  viewCountTotal: number | null;
  uploadsPlaylistId: string;
  publishedAt: string; // ISO — channel creation date, used as the Analytics API's lifetime startDate
};

// GET /channels?mine=true — resolves the connected channel AND its uploads
// playlist id (the only way to list a channel's videos via the Data API).
export async function fetchChannel(accessToken: string): Promise<YoutubeChannel> {
  const url = new URL(`${YOUTUBE_DATA_API_BASE}/channels`);
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("mine", "true");
  const { status, body } = await request(url, { headers: authHeaders(accessToken) });
  if (status < 200 || status >= 300) {
    throw new Error(`YouTube channel fetch failed (status ${status}): ${describeApiError(body)}`);
  }
  const rec = asRecord(body) ?? {};
  const items = Array.isArray(rec.items) ? rec.items : [];
  const item = asRecord(items[0]);
  if (!item) throw new YoutubeChannelNotFoundError();

  const id = str(item.id);
  const snippet = asRecord(item.snippet);
  const statistics = asRecord(item.statistics);
  const uploadsPlaylistId = str(asRecord(asRecord(item.contentDetails)?.relatedPlaylists)?.uploads);
  if (!id || !uploadsPlaylistId) throw new YoutubeChannelNotFoundError();

  const thumbnails = asRecord(snippet?.thumbnails);
  const thumbnailUrl = str(asRecord(thumbnails?.high)?.url) ?? str(asRecord(thumbnails?.default)?.url);

  return {
    channelId: id,
    title: str(snippet?.title),
    thumbnailUrl,
    subscriberCount: statistics && str(statistics.hiddenSubscriberCount) !== "true" ? num(Number(statistics.subscriberCount)) : null,
    viewCountTotal: num(Number(statistics?.viewCount)),
    uploadsPlaylistId,
    publishedAt: str(snippet?.publishedAt) ?? new Date(0).toISOString(),
  };
}

export type RawYoutubeVideo = { id: string; title: string; thumbnailUrl: string | null; publishedAt: string };

async function fetchPageWithRetry(url: URL, headers: Record<string, string>): Promise<{ data: unknown[]; nextPageToken: string | null } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, body } = await request(url, { headers });
      if (status >= 200 && status < 300) {
        const rec = asRecord(body) ?? {};
        const data = Array.isArray(rec.items) ? rec.items : [];
        return { data, nextPageToken: str(rec.nextPageToken) };
      }
    } catch {
      // Network-level failure — fall through to retry, same as a non-2xx status above.
    }
    if (attempt === 0) await sleep(YOUTUBE_REQUEST_RETRY_DELAY_MS);
  }
  return null;
}

// GET /playlistItems, paginated — capped at YOUTUBE_MAX_BACKFILL_VIDEOS (a
// v1 limit, see protocol.ts). A failure on the FIRST page is a real total
// failure (throws); a failure on a LATER page returns whatever was already
// accumulated instead of discarding it, same recovery philosophy as
// Instagram's listMedia.
export async function listUploadedVideos(accessToken: string, uploadsPlaylistId: string): Promise<RawYoutubeVideo[]> {
  const items: RawYoutubeVideo[] = [];
  let pageToken: string | null = null;
  const headers = authHeaders(accessToken);

  do {
    const url = new URL(`${YOUTUBE_DATA_API_BASE}/playlistItems`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const page = await fetchPageWithRetry(url, headers);
    if (!page) {
      if (items.length === 0) throw new Error("YouTube playlistItems list failed on the first page");
      console.error("[youtube] listUploadedVideos: a later page failed after retry, returning partial results");
      break;
    }
    for (const raw of page.data) {
      const item = asRecord(raw);
      const snippet = asRecord(item?.snippet);
      const videoId = str(asRecord(snippet?.resourceId)?.videoId);
      const publishedAt = str(snippet?.publishedAt);
      if (!videoId || !publishedAt) continue;
      const thumbnails = asRecord(snippet?.thumbnails);
      const thumbnailUrl = str(asRecord(thumbnails?.high)?.url) ?? str(asRecord(thumbnails?.default)?.url);
      items.push({ id: videoId, title: str(snippet?.title) ?? videoId, thumbnailUrl, publishedAt });
    }
    pageToken = page.nextPageToken;
    if (page.data.length === 0) break;
  } while (pageToken && items.length < YOUTUBE_MAX_BACKFILL_VIDEOS);

  return items.slice(0, YOUTUBE_MAX_BACKFILL_VIDEOS);
}

// ISO 8601 duration ("PT4M13S") -> seconds. contentDetails.duration is
// always in this form for a regular video per the Data API docs.
function parseIso8601Duration(value: string | null): number | null {
  if (!value) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export type VideoDurations = Map<string, number>; // videoId -> seconds
export type VideoPrivacyStatuses = Map<string, string>; // videoId -> "public" | "unlisted" | "private"
export type VideoDetails = { durations: VideoDurations; privacyStatuses: VideoPrivacyStatuses };

// GET /videos?part=contentDetails,status, batched by 50 ids (the Data API's
// max per call) — neither duration nor privacy status is exposed on the
// playlistItems edge, only here. Both parts ride the same request: videos.list
// costs 1 quota unit per call regardless of how many parts are asked for, so
// privacy status is free compared to a second round of calls.
export async function fetchVideoDetails(accessToken: string, videoIds: string[]): Promise<VideoDetails> {
  const durations: VideoDurations = new Map();
  const privacyStatuses: VideoPrivacyStatuses = new Map();
  const headers = authHeaders(accessToken);

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = new URL(`${YOUTUBE_DATA_API_BASE}/videos`);
    url.searchParams.set("part", "contentDetails,status");
    url.searchParams.set("id", chunk.join(","));
    try {
      const { status, body } = await request(url, { headers });
      if (status < 200 || status >= 300) continue;
      const rec = asRecord(body) ?? {};
      const items = Array.isArray(rec.items) ? rec.items : [];
      for (const raw of items) {
        const item = asRecord(raw);
        const id = str(item?.id);
        if (!id) continue;
        const duration = parseIso8601Duration(str(asRecord(item?.contentDetails)?.duration));
        if (duration !== null) durations.set(id, duration);
        const privacyStatus = str(asRecord(item?.status)?.privacyStatus);
        if (privacyStatus) privacyStatuses.set(id, privacyStatus);
      }
    } catch (error) {
      console.error(`[youtube] fetchVideoDetails chunk starting at ${i} failed, continuing`, error);
    }
  }
  return { durations, privacyStatuses };
}

export type VideoAnalyticsMetrics = Record<string, number>;

const ANALYTICS_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
] as const;

function parseReportsResponse(body: unknown): Map<string, VideoAnalyticsMetrics> {
  const rec = asRecord(body) ?? {};
  const headers = Array.isArray(rec.columnHeaders) ? rec.columnHeaders : [];
  const columnNames = headers.map((h) => str(asRecord(h)?.name) ?? "");
  const rows = Array.isArray(rec.rows) ? rec.rows : [];
  const result = new Map<string, VideoAnalyticsMetrics>();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const videoIdIndex = columnNames.indexOf("video");
    const videoId = str(row[videoIdIndex]);
    if (!videoId) continue;
    const metrics: VideoAnalyticsMetrics = {};
    columnNames.forEach((name, index) => {
      if (name === "video") return;
      const value = num(row[index]);
      if (value !== null) metrics[name] = value;
    });
    result.set(videoId, metrics);
  }
  return result;
}

async function queryReports(
  accessToken: string,
  videoIds: string[],
  metrics: readonly string[],
  startDate: string,
  endDate: string
): Promise<Map<string, VideoAnalyticsMetrics>> {
  const url = new URL(`${YOUTUBE_ANALYTICS_API_BASE}/reports`);
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("dimensions", "video");
  url.searchParams.set("metrics", metrics.join(","));
  url.searchParams.set("filters", `video==${videoIds.join(",")}`);
  url.searchParams.set("maxResults", String(YOUTUBE_ANALYTICS_BATCH_SIZE));
  const { status, body } = await request(url, { headers: authHeaders(accessToken) });
  if (status < 200 || status >= 300) return new Map();
  return parseReportsResponse(body);
}

// Batched per-video lifetime metrics via the Analytics API's `video`
// dimension — startDate/endDate span the WHOLE requested range (typically
// channel creation -> today) so the numbers are lifetime cumulative totals,
// same semantics as Instagram's reach/likes snapshot, never a windowed
// delta. `sinceDate` in backfill.ts only controls WHICH videos are included
// in a given sync, not this date range. Never throws on a failed batch —
// that batch's videos simply get an empty metrics object, same
// graceful-degradation rule as fetchMediaInsights.
//
// Deliberately does NOT query impressions/impressionsClickThroughRate —
// see protocol.ts's YOUTUBE_THUMBNAIL_CTR_AVAILABLE for why (confirmed via
// a live probe: those metric names are rejected outright by the real-time
// Analytics API, for every video, so querying them was a wasted call that
// always failed).
export async function fetchVideoAnalytics(
  accessToken: string,
  videoIds: string[],
  channelPublishedAt: string
): Promise<Map<string, VideoAnalyticsMetrics>> {
  const startDate = channelPublishedAt.slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);
  const result = new Map<string, VideoAnalyticsMetrics>();

  for (let i = 0; i < videoIds.length; i += YOUTUBE_ANALYTICS_BATCH_SIZE) {
    const chunk = videoIds.slice(i, i + YOUTUBE_ANALYTICS_BATCH_SIZE);
    const core = await queryReports(accessToken, chunk, ANALYTICS_METRICS, startDate, endDate).catch((error) => {
      console.error(`[youtube] fetchVideoAnalytics core metrics chunk starting at ${i} failed`, error);
      return new Map<string, VideoAnalyticsMetrics>();
    });
    for (const videoId of chunk) {
      const metrics = core.get(videoId);
      if (metrics && Object.keys(metrics).length > 0) result.set(videoId, metrics);
    }
  }
  return result;
}
