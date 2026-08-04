// ─────────────────────────────────────────────────────────────────────────
// Instagram Graph API constants — "Instagram API with Instagram Login" flow
// (no Facebook Page required, unlike the older "Facebook Login for
// Business" path). This is the single highest-uncertainty file in this
// integration: Meta has changed this API's surface multiple times over the
// last few years. Everything below is best-current-understanding, NOT
// verified against a live probe yet — confirm each endpoint/field against a
// real Meta App (developer.facebook.com) before trusting it in production,
// and only edit THIS file if something is wrong; the rest of lib/instagram/
// and every caller should never need to change for an API-surface fix.
//
// Flow:
//   1. Authorize: redirect the user to INSTAGRAM_AUTHORIZE_URL.
//   2. Callback receives a `code`, exchanged at INSTAGRAM_TOKEN_URL for a
//      SHORT-LIVED token (~1h).
//   3. Immediately exchange that for a LONG-LIVED token (~60 days) at
//      INSTAGRAM_LONG_LIVED_TOKEN_URL.
//   4. Before it expires, refresh at INSTAGRAM_REFRESH_TOKEN_URL (only works
//      while the token is still valid — if it fully expires the user must
//      reconnect from scratch).
//
// ⚠️ client_id/client_secret gotcha (confirmed 2026-08-04 via a live "Invalid
// platform app" error): these are NOT the App ID/App Secret shown at the top
// of the Meta App dashboard (App settings > Basic). Adding the Instagram
// product generates a SEPARATE Instagram App ID / Instagram App Secret,
// shown under Instagram > API setup with Instagram login > Business login
// settings — THOSE are INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET in .env.local.
// The top-level Meta App ID is a different platform app and gets rejected.
// ─────────────────────────────────────────────────────────────────────────

// Pinned API version — bump here (and re-verify the metric tables below)
// when upgrading, never scattered across call sites.
export const INSTAGRAM_GRAPH_API_VERSION = "v21.0";
export const INSTAGRAM_GRAPH_API_BASE = `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}`;

export const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const INSTAGRAM_LONG_LIVED_TOKEN_URL = "https://graph.instagram.com/access_token";
export const INSTAGRAM_REFRESH_TOKEN_URL = "https://graph.instagram.com/refresh_access_token";

// Read-only scopes only — this integration never publishes or manages
// messages on the user's behalf, so no instagram_business_content_publish /
// instagram_business_manage_messages requested (narrower scope = less to
// justify in Meta's App Review).
export const INSTAGRAM_OAUTH_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"] as const;

// A long-lived token is valid ~60 days; refresh once inside this window to
// stay ahead of expiry with margin (Meta's own guidance: refresh anytime
// after day 1, well before day 60).
export const INSTAGRAM_TOKEN_REFRESH_MARGIN_DAYS = 7;

// Recurring insights refresh only looks at media published within this
// window — organic numbers stabilize well before this, bounding the
// recurring job's cost independent of the account's total post history.
export const INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS = 30;

// Backfill safety cap on the very first sync (most-recent-first pagination)
// — a v1 limit, not a hard architectural ceiling.
export const INSTAGRAM_MAX_BACKFILL_MEDIA = 500;

export type InstagramAccountType = "BUSINESS" | "MEDIA_CREATOR" | "PERSONAL";

export type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "STORY";

// Per-media-type metric list for GET /{media-id}/insights?metric=... — Meta
// rejects a metric that doesn't apply to a given media_type, so the request
// must branch on it rather than requesting one fixed list for everything.
// "reach" is requested everywhere (primary/reliable); "impressions" is
// opportunistic-only (see lib/instagram/client.ts's graceful per-metric
// degradation — a rejected metric must never fail the whole insights call).
export const INSTAGRAM_INSIGHTS_METRICS: Record<InstagramMediaType, readonly string[]> = {
  IMAGE: ["reach", "impressions", "saved", "shares", "profile_visits", "follows", "total_interactions"],
  CAROUSEL_ALBUM: ["reach", "impressions", "saved", "shares", "profile_visits", "follows", "total_interactions"],
  VIDEO: [
    "reach",
    "impressions",
    "saved",
    "shares",
    "profile_visits",
    "follows",
    "total_interactions",
    "plays",
    "ig_reels_avg_watch_time",
    "ig_reels_video_view_total_time",
  ],
  STORY: ["reach", "impressions", "taps_forward", "taps_back", "exits", "replies"],
} as const;

// Organic click tracking is NOT available via this API for feed posts/reels
// — Meta exposes no per-post "link clicks" metric for organic content (only
// Story link-sticker taps, which land in storyTaps*, or paid/boosted
// content via the separate Ads Insights API, out of scope for this
// integration). Every caller must treat contentPosts.clicks as permanently
// null for source="instagram" rows, never a measured 0 — see
// lib/content-posts/rates.ts and the connection card's masterclass copy.
export const INSTAGRAM_ORGANIC_CLICKS_AVAILABLE = false;
