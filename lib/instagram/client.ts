import {
  INSTAGRAM_CAROUSEL_CHILDREN_FIELDS,
  INSTAGRAM_GRAPH_API_BASE,
  INSTAGRAM_INSIGHTS_METRICS,
  INSTAGRAM_LONG_LIVED_TOKEN_URL,
  INSTAGRAM_MAX_BACKFILL_MEDIA,
  INSTAGRAM_PAGE_RETRY_DELAY_MS,
  INSTAGRAM_REFRESH_TOKEN_URL,
  INSTAGRAM_STORY_MEDIA_FIELDS,
  INSTAGRAM_TOKEN_URL,
  type InstagramAccountType,
  type InstagramMediaType,
} from "./protocol";

// Thin server-only HTTP client for the Instagram Graph API. Auth is the
// account's own OAuth token (obtained via app/api/instagram/{connect,
// callback}), decrypted at the call site, never logged — same rule as every
// other BYOK/OAuth integration in this codebase.

const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GraphResponse = { status: number; body: unknown };

async function request(url: URL, init?: { method?: string; body?: URLSearchParams }): Promise<GraphResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
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

// Thrown when the connected account authenticates but is a PERSONAL account
// (not Business/Creator) — the #1 actionable failure mode this integration
// needs to surface clearly, since insights are structurally unavailable for
// personal accounts. Callers branch on this the same way the iClosed/
// Calendly clients branch on their own "no API access" errors.
export class InstagramNotProfessionalAccountError extends Error {
  constructor() {
    super("Ce compte Instagram est un compte personnel — un compte Professionnel (Business ou Créateur) est requis.");
    this.name = "InstagramNotProfessionalAccountError";
  }
}

export type TokenExchangeResult = { accessToken: string; igUserId: string };

// Step 1 of the OAuth callback: exchanges the authorization `code` for a
// SHORT-LIVED token (~1h). Meta's token endpoint for this flow already
// returns the Instagram-scoped user_id directly (no separate Page lookup
// needed, unlike the older Facebook Login for Business path).
export async function exchangeCodeForToken(params: {
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
  const { status, body: resBody } = await request(new URL(INSTAGRAM_TOKEN_URL), { method: "POST", body });
  const rec = asRecord(resBody) ?? {};
  const accessToken = str(rec.access_token);
  const igUserId = str(rec.user_id) ?? (num(rec.user_id) !== null ? String(rec.user_id) : null);
  if (status < 200 || status >= 300 || !accessToken || !igUserId) {
    throw new Error(`Instagram code exchange failed (status ${status})`);
  }
  return { accessToken, igUserId };
}

export type LongLivedTokenResult = { accessToken: string; expiresInSeconds: number };

// Step 2: exchanges a short-lived token for a long-lived one (~60 days).
export async function exchangeForLongLivedToken(shortLivedToken: string, clientSecret: string): Promise<LongLivedTokenResult> {
  const url = new URL(INSTAGRAM_LONG_LIVED_TOKEN_URL);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", shortLivedToken);
  const { status, body } = await request(url);
  const rec = asRecord(body) ?? {};
  const accessToken = str(rec.access_token);
  const expiresInSeconds = num(rec.expires_in);
  if (status < 200 || status >= 300 || !accessToken || expiresInSeconds === null) {
    throw new Error(`Instagram long-lived token exchange failed (status ${status})`);
  }
  return { accessToken, expiresInSeconds };
}

// Refreshes an existing long-lived token before it expires — only works
// while the token is still valid; a fully-expired token requires the user
// to reconnect from scratch (see refresh-instagram-insights.ts's cron).
export async function refreshLongLivedToken(currentToken: string): Promise<LongLivedTokenResult> {
  const url = new URL(INSTAGRAM_REFRESH_TOKEN_URL);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentToken);
  const { status, body } = await request(url);
  const rec = asRecord(body) ?? {};
  const accessToken = str(rec.access_token);
  const expiresInSeconds = num(rec.expires_in);
  if (status < 200 || status >= 300 || !accessToken || expiresInSeconds === null) {
    throw new Error(`Instagram token refresh failed (status ${status})`);
  }
  return { accessToken, expiresInSeconds };
}

export type InstagramProfile = {
  igUserId: string;
  username: string | null;
  accountType: InstagramAccountType;
  followersCount: number | null;
};

// The profile endpoint has not exposed the follower field consistently across
// the Instagram Login API versions. Keep this probe isolated and optional so
// a missing field never turns a successful Instagram connection into a failed
// one. The singular spelling is accepted as a compatibility fallback for
// responses coming from the older profile surface.
async function fetchFollowerCount(accessToken: string): Promise<number | null> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/me`);
  url.searchParams.set("fields", "followers_count");
  url.searchParams.set("access_token", accessToken);
  try {
    const { status, body } = await request(url);
    if (status < 200 || status >= 300) return null;
    const rec = asRecord(body) ?? {};
    const value = num(rec.followers_count) ?? num(rec.follower_count);
    if (value === null || value < 0) return null;
    return Math.round(value);
  } catch {
    return null;
  }
}

// GET /me — resolves the connected profile AND detects a PERSONAL account
// (the one case this integration must refuse and explain clearly rather
// than silently syncing zero posts).
export async function fetchProfile(accessToken: string): Promise<InstagramProfile> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/me`);
  url.searchParams.set("fields", "user_id,username,account_type");
  url.searchParams.set("access_token", accessToken);
  const { status, body } = await request(url);
  const rec = asRecord(body) ?? {};
  const igUserId = str(rec.user_id) ?? (num(rec.user_id) !== null ? String(rec.user_id) : null);
  if (status < 200 || status >= 300 || !igUserId) {
    throw new Error(`Instagram profile fetch failed (status ${status})`);
  }
  const accountType = (str(rec.account_type) ?? "PERSONAL").toUpperCase() as InstagramAccountType;
  if (accountType === "PERSONAL") {
    throw new InstagramNotProfessionalAccountError();
  }
  return { igUserId, username: str(rec.username), accountType, followersCount: await fetchFollowerCount(accessToken) };
}

export type RawInstagramMedia = {
  id: string;
  caption: string | null;
  mediaType: InstagramMediaType;
  permalink: string | null;
  timestamp: string; // ISO
  // Live on the media object itself, not the /insights edge (unlike reach/
  // impressions/saved/etc.) — Graph API has always exposed these as plain
  // fields, not insight metrics.
  likeCount: number | null;
  commentsCount: number | null;
  // Short-lived signed CDN URLs — see db/schema.ts's instagramPostInsights
  // for the full caveat (video vs image, always null for CAROUSEL_ALBUM).
  mediaUrl: string | null;
  thumbnailUrl: string | null;
};

// One page of a paginated Graph API edge — fetched with one retry on
// failure (network exception OR non-2xx status, both treated the same way)
// before the caller decides whether to give up on the whole list or just
// stop pagination early. Returns null only after the retry also failed.
async function fetchPageWithRetry(url: URL): Promise<{ data: unknown[]; next: URL | null } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, body } = await request(url);
      if (status >= 200 && status < 300) {
        const rec = asRecord(body) ?? {};
        const data = Array.isArray(rec.data) ? rec.data : [];
        const next = str(asRecord(rec.paging)?.next);
        return { data, next: next ? new URL(next) : null };
      }
    } catch {
      // Network-level failure (timeout/DNS/reset) — fall through to retry,
      // same as a non-2xx status above.
    }
    if (attempt === 0) await sleep(INSTAGRAM_PAGE_RETRY_DELAY_MS);
  }
  return null;
}

function parseMediaItem(raw: unknown): RawInstagramMedia | null {
  const item = asRecord(raw);
  if (!item) return null;
  const id = str(item.id);
  const timestamp = str(item.timestamp);
  if (!id || !timestamp) return null;
  // media_product_type distinguishes STORY/REELS from a plain feed
  // media_type — prefer it when present (Meta's more precise field),
  // fall back to media_type otherwise.
  const productType = str(item.media_product_type)?.toUpperCase();
  const mediaType = (productType === "STORY" ? "STORY" : str(item.media_type)?.toUpperCase()) as InstagramMediaType | undefined;
  if (!mediaType) return null;
  return {
    id,
    caption: str(item.caption),
    mediaType,
    permalink: str(item.permalink),
    timestamp,
    likeCount: num(item.like_count),
    commentsCount: num(item.comments_count),
    mediaUrl: str(item.media_url),
    thumbnailUrl: str(item.thumbnail_url),
  };
}

// GET /me/media, paginated via the response's own paging.next cursor URL —
// capped at INSTAGRAM_MAX_BACKFILL_MEDIA (a v1 limit, see protocol.ts). A
// failure on the FIRST page is a real total failure (throws, same as
// before); a failure on a LATER page returns whatever was already
// accumulated instead of discarding it — losing pages 1-9 because page 10
// hiccuped was a real cause of posts silently disappearing from a sync.
export async function listMedia(accessToken: string): Promise<RawInstagramMedia[]> {
  const items: RawInstagramMedia[] = [];
  let url: URL | null = new URL(`${INSTAGRAM_GRAPH_API_BASE}/me/media`);
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url"
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "50");

  while (url && items.length < INSTAGRAM_MAX_BACKFILL_MEDIA) {
    const page = await fetchPageWithRetry(url);
    if (!page) {
      if (items.length === 0) {
        throw new Error("Instagram media list failed on the first page");
      }
      console.error("[instagram] listMedia: a later page failed after retry, returning partial results");
      break;
    }
    for (const raw of page.data) {
      const parsed = parseMediaItem(raw);
      if (parsed) items.push(parsed);
    }
    url = page.next;
    if (page.data.length === 0) break;
  }
  return items.slice(0, INSTAGRAM_MAX_BACKFILL_MEDIA);
}

// GET /me/stories — see protocol.ts's INSTAGRAM_STORY_MEDIA_FIELDS for the
// caveat that this edge's existence under this OAuth flow is unconfirmed,
// and that Meta only ever returns currently-active (non-expired) stories.
// Contract: NEVER throws — any failure (missing edge, insufficient scope,
// unexpected shape) degrades to an empty array, same as "this account has
// no active stories right now".
export async function listStories(accessToken: string): Promise<RawInstagramMedia[]> {
  try {
    const items: RawInstagramMedia[] = [];
    let url: URL | null = new URL(`${INSTAGRAM_GRAPH_API_BASE}/me/stories`);
    url.searchParams.set("fields", INSTAGRAM_STORY_MEDIA_FIELDS);
    url.searchParams.set("access_token", accessToken);
    // Defensive cap only — active stories are inherently few (< 24h
    // retention), nowhere near INSTAGRAM_MAX_BACKFILL_MEDIA's scale.
    const STORY_CAP = 100;

    while (url && items.length < STORY_CAP) {
      const page = await fetchPageWithRetry(url);
      if (!page) break;
      for (const raw of page.data) {
        const parsed = parseMediaItem(raw);
        if (parsed) items.push({ ...parsed, mediaType: "STORY" });
      }
      url = page.next;
      if (page.data.length === 0) break;
    }
    return items.slice(0, STORY_CAP);
  } catch (error) {
    console.error("[instagram] listStories failed, treating as zero active stories", error);
    return [];
  }
}

// GET /{media-id}/children — a CAROUSEL_ALBUM's root object never exposes
// media_url/thumbnail_url itself (see protocol.ts's
// INSTAGRAM_CAROUSEL_CHILDREN_FIELDS), only its children do. Resolves the
// FIRST child as the album's cover. Never throws — a carousel simply gets
// no thumbnail on any failure, same as before this function existed.
export async function fetchCarouselChildren(accessToken: string, mediaId: string): Promise<{ coverUrl: string | null }> {
  try {
    const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/${mediaId}/children`);
    url.searchParams.set("fields", INSTAGRAM_CAROUSEL_CHILDREN_FIELDS);
    url.searchParams.set("access_token", accessToken);
    const { status, body } = await request(url);
    if (status < 200 || status >= 300) return { coverUrl: null };
    const rec = asRecord(body) ?? {};
    const data = Array.isArray(rec.data) ? rec.data : [];
    const first = asRecord(data[0]);
    if (!first) return { coverUrl: null };
    const childType = str(first.media_type)?.toUpperCase();
    const coverUrl = childType === "VIDEO" ? str(first.thumbnail_url) : str(first.media_url);
    return { coverUrl };
  } catch (error) {
    console.error(`[instagram] fetchCarouselChildren failed for media ${mediaId}`, error);
    return { coverUrl: null };
  }
}

export type MediaInsights = Record<string, number>;

// GET /{media-id}/insights, metric list branched by media_type. Graceful
// per-metric degradation: if the full-list request is rejected (a single
// unsupported metric for this account/media combination is enough to fail
// the whole call on Meta's side), retry each metric individually and keep
// whichever succeed — never an all-or-nothing failure for one bad metric.
export async function fetchMediaInsights(accessToken: string, mediaId: string, mediaType: InstagramMediaType): Promise<{ metrics: MediaInsights; raw: Record<string, unknown> }> {
  const metricList = INSTAGRAM_INSIGHTS_METRICS[mediaType];
  const full = await fetchInsightsOnce(accessToken, mediaId, metricList);
  if (full.ok) return { metrics: full.metrics, raw: full.raw };

  const metrics: MediaInsights = {};
  let raw: Record<string, unknown> = {};
  for (const metric of metricList) {
    const single = await fetchInsightsOnce(accessToken, mediaId, [metric]);
    if (single.ok) {
      Object.assign(metrics, single.metrics);
      raw = { ...raw, ...single.raw };
    }
  }
  return { metrics, raw };
}

async function fetchInsightsOnce(
  accessToken: string,
  mediaId: string,
  metricList: readonly string[]
): Promise<{ ok: boolean; metrics: MediaInsights; raw: Record<string, unknown> }> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/${mediaId}/insights`);
  url.searchParams.set("metric", metricList.join(","));
  url.searchParams.set("access_token", accessToken);
  const { status, body } = await request(url);
  if (status < 200 || status >= 300) return { ok: false, metrics: {}, raw: {} };

  const rec = asRecord(body) ?? {};
  const data = Array.isArray(rec.data) ? rec.data : [];
  const metrics: MediaInsights = {};
  for (const entry of data) {
    const item = asRecord(entry);
    const name = str(item?.name);
    const values = Array.isArray(item?.values) ? item?.values : null;
    const total = num(item?.total_value) ?? num(asRecord(values?.[0])?.value);
    if (name && total !== null) metrics[name] = total;
  }
  return { ok: true, metrics, raw: rec };
}
