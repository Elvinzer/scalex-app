// ─────────────────────────────────────────────────────────────────────────
// YouTube Data API v3 + YouTube Analytics API constants — OAuth via Google.
// This is the single highest-uncertainty file in this integration, same
// role as lib/instagram/protocol.ts for that one: everything below is
// best-current-understanding from Google's published docs, NOT verified
// against a live probe yet — confirm each endpoint/field/quota against a
// real Google Cloud OAuth client before trusting it in production, and only
// edit THIS file if something is wrong; the rest of lib/youtube/ and every
// caller should never need to change for an API-surface fix.
//
// Flow:
//   1. Authorize: redirect the user to YOUTUBE_AUTHORIZE_URL with
//      access_type=offline&prompt=consent — Google only returns a
//      refresh_token on the FIRST consent grant unless prompt=consent forces
//      re-issuance, so a reconnect that omits it silently ends up without a
//      refresh token and can't be kept alive past the first ~1h access token.
//   2. Callback receives a `code`, exchanged at YOUTUBE_TOKEN_URL for a
//      SHORT-LIVED access token (~1h) + a refresh token (no fixed expiry,
//      revoked only on user action or ~6 months of inactivity).
//   3. Every sync run refreshes the access token via YOUTUBE_TOKEN_URL's
//      refresh_token grant before calling the Data/Analytics APIs — unlike
//      Instagram's days-long refresh margin, there is no "margin" here: the
//      token is short-lived enough that every single sync just refreshes it.
//
// ⚠️ Sensitive-scope caveat: youtube.readonly and yt-analytics.readonly are
// both classified "sensitive" by Google, which requires OAuth consent screen
// verification (a multi-day review + an unlisted demo video) before the app
// can accept arbitrary external accounts. Until that review completes, ONLY
// accounts added as Test Users in the Google Cloud Console (cap: 100) can
// complete this flow — the exact same situation as Instagram's pending Meta
// App Review (see lib/instagram/protocol.ts's file header), not specific to
// this integration.
// ─────────────────────────────────────────────────────────────────────────

export const YOUTUBE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Pinned API surface — bump/re-verify here, never scattered across call sites.
export const YOUTUBE_DATA_API_BASE = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_ANALYTICS_API_BASE = "https://youtubeanalytics.googleapis.com/v2";

// Read-only scopes only — this integration never uploads, edits, or manages
// the channel, so no youtube.force-ssl / youtube.upload requested (narrower
// scope = less to justify in Google's sensitive-scope review).
export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

// Safety margin before the ~1h access token's real expiry to trigger a
// refresh — small because every sync refreshes anyway; this only protects a
// long-running single sync from expiring mid-run.
export const YOUTUBE_TOKEN_REFRESH_MARGIN_SECONDS = 300;

// Recurring insights refresh only re-polls videos published within this
// window — watch time/retention stabilize well before this, bounding the
// recurring job's cost independent of the channel's total upload history.
export const YOUTUBE_INSIGHTS_REFRESH_WINDOW_DAYS = 30;

// Backfill safety cap on the very first sync (most-recent-first pagination
// via the uploads playlist) — a v1 limit, not a hard architectural ceiling.
export const YOUTUBE_MAX_BACKFILL_VIDEOS = 1000;

// Max video IDs per YouTube Analytics API reports.query `filters=video==...`
// call, per Google's documented limit — UNVERIFIED against a live probe, see
// file header. Deliberate architectural difference from Instagram: the
// Analytics API's `video` dimension lets one call return metrics for many
// videos at once, so the backfill batches instead of looping+throttling
// per-item like Instagram's /insights (which has no such batch mode).
export const YOUTUBE_ANALYTICS_BATCH_SIZE = 500;

// Wall-clock budget backfillYoutubeVideos gives itself before stopping early
// and reporting `completed: false` — same rationale as
// INSTAGRAM_BACKFILL_TIME_BUDGET_MS: a channel with a large previously-
// unsynced history can take longer than a single serverless invocation
// allows (see app/api/inngest/route.ts's maxDuration). Comfortably under
// that ceiling; callers that get `completed: false` back are responsible for
// scheduling a follow-up run (lib/inngest/functions/continue-youtube-backfill.ts)
// rather than silently dropping the rest of the backlog.
export const YOUTUBE_BACKFILL_TIME_BUDGET_MS = 240_000;

// A single retry delay for a failed page/batch fetch (network exception or
// non-2xx status) before giving up on that page/batch and keeping whatever
// was already accumulated — same philosophy as
// INSTAGRAM_PAGE_RETRY_DELAY_MS/fetchPageWithRetry.
export const YOUTUBE_REQUEST_RETRY_DELAY_MS = 750;

// Organic click tracking is NOT available via this API surface — the CTR
// exposed by the Analytics API (impressionsClickThroughRate) measures a
// thumbnail click from browse/search/suggested surfaces, not an outbound
// link click, so it is never projected into content_posts.clicks. Every
// caller must treat contentPosts.clicks as permanently null for
// source="youtube" rows, never a measured 0 — see
// lib/content-posts/rates.ts and the connection card's copy. Mirrors
// INSTAGRAM_ORGANIC_CLICKS_AVAILABLE.
export const YOUTUBE_ORGANIC_CLICKS_AVAILABLE = false;
