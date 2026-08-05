import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type {
  BusinessAcquisition,
  BusinessDelivery,
  BusinessIdentity,
  BusinessSales,
} from "@/lib/business/types";
import type { SaleInstallment } from "@/lib/sales/types";
import type { WeeklyReportBottleneck, WeeklyReportStatCard } from "@/lib/dashboard/weekly-report-types";

// Supabase-managed schema — referenced only to type the FK below, never
// created or altered by our own migrations (drizzle-kit only touches
// tables declared with pgTable, not this pgSchema mirror).
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// Used to pick which row of lib/setting/benchmarks.ts to compare a user's
// KPI rates against — null means "not set", falls back to the global (all
// sectors) benchmark.
export const prospectionSector = pgEnum("prospection_sector", [
  "coaching_b2b_high_ticket",
  "low_ticket_infoproduct",
  "ecommerce_dtc",
  "real_estate_finance",
]);

export const users = pgTable("users", {
  // Same id as auth.users — this table only carries app-specific columns,
  // Supabase Auth remains the source of truth for identity.
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Shown in the sidebar's profile menu (components/app-sidebar.tsx) in place
  // of businessName when set. Nullable — most accounts won't set one.
  displayName: text("display_name"),
  // Public URL from the Supabase Storage "avatars" bucket (see the SQL in
  // the settings profile-form's implementation notes) — not our own upload
  // endpoint, so this is just a URL string, never raw image bytes.
  avatarUrl: text("avatar_url"),
  anthropicApiKeyEncrypted: text("anthropic_api_key_encrypted"),
  // True only when a previously-accepted BYOK key is now confirmed dead
  // (Anthropic returned 401 on a real call) — cleared automatically the next
  // time a key passes validateAnthropicKey(). See lib/agent/validate-key.ts.
  anthropicApiKeyInvalid: boolean("anthropic_api_key_invalid").notNull().default(false),
  // Denormalized copy of stripe_connections.stripe_account_id for the active
  // connection, kept in sync on connect/disconnect — avoids a join to check
  // "is this user connected to Stripe". stripe_connections stays the source
  // of truth (token, connected_at).
  stripeConnectId: text("stripe_connect_id"),
  // Scale X's OWN Stripe customer id for this account (platform billing —
  // see subscriptions below), created on first checkout attempt so retrying
  // an abandoned checkout reuses the same Stripe Customer instead of
  // minting duplicates. Distinct from stripeConnectId above (that one
  // identifies the CLIENT's connected account, read-only).
  stripeCustomerId: text("stripe_customer_id"),
  // Denormalized "is this account connected to iClosed" flag, kept in sync on
  // connect/disconnect (mirrors stripeConnectId's role for Stripe). The API key
  // itself lives in iclosed_connections — this is just the 1-column check used
  // by /integrations and /ventes/appels to avoid a join.
  iclosedConnected: boolean("iclosed_connected").notNull().default(false),
  // Same denormalized "is connected" flag for Calendly — the other supported
  // call-booking tool (a user can connect either or both).
  calendlyConnected: boolean("calendly_connected").notNull().default(false),
  // Same denormalized "is connected" flag for Instagram (content analytics,
  // not a call-booking tool — see instagram_connections/instagram_post_insights).
  instagramConnected: boolean("instagram_connected").notNull().default(false),
  // Same denormalized "is connected" flag for YouTube (channel analytics —
  // see youtube_connections/youtube_video_insights).
  youtubeConnected: boolean("youtube_connected").notNull().default(false),
  sector: prospectionSector("sector"),
  // Set once the 3-screen /onboarding wizard finishes (or is skipped) —
  // existing users are backfilled to true via migration default so they
  // never see the flow. See app/onboarding/.
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  // Idempotency guard so the "business_profile_completed" analytics event
  // (lib/analytics.ts) fires exactly once, the first time global completion
  // crosses 80% — see lib/business/completion.ts's computeGlobalCompletion.
  businessProfileCompletedAt: timestamp("business_profile_completed_at", { withTimezone: true }),
  // Monday weekly-brief email opt-out (lib/inngest/functions/weekly-brief-email.ts).
  weeklyEmailEnabled: boolean("weekly_email_enabled").notNull().default(true),
  // Excludes founders'/QA accounts from the weekly email — set manually via
  // DB for now, no admin UI toggle in this chantier.
  isTestAccount: boolean("is_test_account").notNull().default(false),
  // Snapshot of the one diagnostic rate the user most recently opened the
  // "Améliorer" chat about, so the next weekly check-in can show a
  // before/after ("ton taux est passé de X% à Y%"). One of the 5
  // lib/diagnostic/benchmarks.ts MetricKey values, or null if no chat opened
  // on a specific rate yet (e.g. "general"/"followupRecovery" don't set this).
  lastImproveMetricKey: text("last_improve_metric_key"),
  lastImproveMetricRateSnapshot: real("last_improve_metric_rate_snapshot"), // 0-1 fraction
  // Idempotency guard for the weekly cron (lib/inngest/functions/weekly-brief-email.ts):
  // skipped if set within the last 6 days, so a replayed function run never
  // double-sends the Monday email.
  lastWeeklyBriefSentAt: timestamp("last_weekly_brief_sent_at", { withTimezone: true }),
  // Gates the whole "Avancé" hub (Ads, Bibliothèque d'appels, Setting
  // quotidien, Closing quotidien, Équipe) as one unit — see
  // components/app-sidebar.tsx and app/(app)/avance/page.tsx. Deliberately
  // ONE flag, not five: every module under Avancé shares this same door.
  // History (do NOT "simplify" this column away thinking false-by-default
  // was always the case): first pushed with .default(true) so every
  // pre-existing account got grandfathered in, then the declared default
  // below was flipped to false and pushed again — Postgres's ALTER COLUMN
  // SET DEFAULT only changes future inserts, it never rewrites existing
  // rows, so pre-existing accounts stayed true and every signup after that
  // second push starts false (self-activatable from /avance).
  advancedModulesEnabled: boolean("advanced_modules_enabled").notNull().default(false),
  // Per-INDIVIDUAL preference (written via the logged-in userId, same
  // pattern as displayName/avatarUrl above — never accountId), independent
  // of the OS-level prefers-reduced-motion: some users want fewer Falco
  // animations without disabling all system motion. See
  // components/falco/falco-context.tsx's useFalcoAnimationsEnabled, which
  // combines both signals.
  reduceFalcoAnimations: boolean("reduce_falco_animations").notNull().default(false),
}).enableRLS();

export const stripeConnections = pgTable("stripe_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Unique: one active Stripe connection per user. Reconnecting overwrites
  // this row rather than creating history.
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeAccountId: text("stripe_account_id").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  // Granted OAuth scope — recorded for audit visibility only. Stripe
  // requires "read_write" for Standard accounts, so this is never used to
  // gate access; see lib/stripe/read-only-client.ts for the actual
  // write-prevention.
  scope: text("scope"),
  connectedAt: timestamp("connected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Captured from the OAuth token response (tokenResponse.livemode) — the
  // sync (lib/stripe/sync.ts) refuses to run against a test-mode connected
  // account, never mixing test/live data into monthly_metrics.
  livemode: boolean("livemode").notNull().default(true),
  // Tracks the one-time automatic 12-month sync triggered on connect (see
  // lib/inngest/functions/sync-stripe-account.ts) — "pending" until that job
  // finishes. No granular per-month progress in this phase (that needs the
  // resync-button/polling infra, deferred).
  initialSyncStatus: text("initial_sync_status").notNull().default("pending"),
  initialSyncCompletedAt: timestamp("initial_sync_completed_at", { withTimezone: true }),
}).enableRLS();

// iClosed connection — the call-booking tool. Unlike Stripe Connect (OAuth),
// iClosed authenticates with a static API key the client generates in their
// dashboard (Settings -> Developers), so this mirrors the Anthropic BYOK model
// (paste + encrypt), not the Stripe OAuth flow. Owner-only, never delegable.
export const iclosedConnections = pgTable("iclosed_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Unique: one active iClosed connection per user. Reconnecting overwrites
  // this row rather than creating history (same rule as stripe_connections).
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // The client's iClosed API key (Bearer "iclosed_..."), encrypted with
  // lib/crypto.ts — NEVER stored or returned in clear (masked "iclosed_...xxxx"
  // preview only), same BYOK rule as users.anthropicApiKeyEncrypted.
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  // Id of the webhook we registered on iClosed's side (POST /v1/webhooks) so we
  // can delete it on disconnect. Null until sync-iclosed-account registers it.
  webhookId: text("webhook_id"),
  // Opaque high-entropy token embedded in our webhook URL
  // (/api/webhooks/iclosed/[token]) — resolves a delivery back to this
  // connection AND authenticates it (iClosed's own signature mechanism, if any,
  // is verified on top when webhookSecretEncrypted is set). Unique lookup key.
  webhookToken: text("webhook_token").notNull().unique(),
  // iClosed's webhook signing secret, if the platform provides one (HMAC) —
  // encrypted, used as an extra verification layer on top of webhookToken.
  // Null until confirmed against iClosed's developer docs.
  webhookSecretEncrypted: text("webhook_secret_encrypted"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  // One-time backfill of recent + upcoming calls on connect (see
  // lib/inngest/functions/sync-iclosed-account.ts) — "pending" until done.
  initialSyncStatus: text("initial_sync_status").notNull().default("pending"),
  initialSyncCompletedAt: timestamp("initial_sync_completed_at", { withTimezone: true }),
}).enableRLS();

// Calendly connection — the other supported call-booking tool. Like iClosed it
// authenticates with a Bearer token (a Personal Access Token the user pastes),
// so this mirrors the BYOK "paste + encrypt" model. Unlike iClosed, Calendly
// DOES expose a webhook-management API (POST /webhook_subscriptions), so
// real-time delivery is registered on connect. Owner-only, never delegable.
export const calendlyConnections = pgTable("calendly_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // The client's Calendly Personal Access Token (Bearer), encrypted — NEVER
  // stored/returned in clear, same rule as iClosed/Anthropic BYOK keys.
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  // Calendly resource URIs resolved from GET /users/me at connect time — needed
  // to scope scheduled-events queries and webhook subscriptions.
  organizationUri: text("organization_uri"),
  userUri: text("user_uri"),
  // Webhook subscription URI (to DELETE on disconnect) + its signing key
  // (encrypted) used to verify incoming deliveries. Null until the sync job
  // registers the subscription.
  webhookId: text("webhook_id"),
  webhookSigningKeyEncrypted: text("webhook_signing_key_encrypted"),
  // Opaque high-entropy token embedded in our webhook URL
  // (/api/webhooks/calendly/[token]) — resolves a delivery back to this
  // connection; the HMAC signature is verified on top.
  webhookToken: text("webhook_token").notNull().unique(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  initialSyncStatus: text("initial_sync_status").notNull().default("pending"),
  initialSyncCompletedAt: timestamp("initial_sync_completed_at", { withTimezone: true }),
}).enableRLS();

// Instagram connection — OAuth ("Instagram API with Instagram Login", see
// lib/instagram/protocol.ts for the exact flow; flagged there as the
// highest-uncertainty integration in this codebase since Meta's API surface
// for this has moved multiple times). Owner-only, never delegable, same
// boundary as Stripe/iClosed/Calendly. Unlike those, the token itself
// expires (~60 days) and must be refreshed — see tokenExpiresAt +
// lib/inngest/functions/refresh-instagram-insights.ts's recurring cron,
// which also re-syncs insight numbers (they keep climbing for days after a
// post goes up, unlike iClosed/Calendly's call data which is finalized at
// booking time).
export const instagramConnections = pgTable("instagram_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  igUserId: text("ig_user_id").notNull(), // Instagram-scoped user id from the Graph API
  username: text("username"), // display only ("Connecté en tant que @handle")
  accessTokenEncrypted: text("access_token_encrypted").notNull(), // long-lived token, encrypted
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  // "pending" | "completed" | "no_api_access" | "token_expired" | "failed" —
  // reused as the general connection-health flag by the recurring refresh
  // cron too, not just the one-time connect backfill.
  initialSyncStatus: text("initial_sync_status").notNull().default("pending"),
  initialSyncCompletedAt: timestamp("initial_sync_completed_at", { withTimezone: true }),
  lastInsightsSyncAt: timestamp("last_insights_sync_at", { withTimezone: true }),
}).enableRLS();

// Full-fidelity raw cache — one row per Instagram media item, every metric
// the Graph API returns. content_posts only ever gets a 6-column PROJECTION
// of this for the existing table/scoring code (see contentPosts.source
// below); this table is the real source of truth, surfaced via a per-row
// detail dialog. Re-fetched periodically (recurring cron, not just at
// connect) since organic insight numbers keep climbing for days/weeks after
// publish.
export const instagramPostInsights = pgTable(
  "instagram_post_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaId: text("media_id").notNull(),
    mediaType: text("media_type").notNull(), // IMAGE | CAROUSEL_ALBUM | VIDEO | REELS | STORY (Graph API's own vocabulary)
    caption: text("caption"),
    permalink: text("permalink"),
    // Instagram's media CDN URLs — SHORT-LIVED signed links (Meta doesn't
    // document an exact TTL; observed on the order of hours/~1-2 days),
    // refreshed on every backfill/resync upsert (lib/instagram/backfill.ts).
    // Rendering code must treat these as best-effort/stale-tolerant (fallback
    // on load error), never assume they stay valid indefinitely. media_url is
    // the raw file — the actual video for VIDEO/REELS (NOT renderable as an
    // <img>), the static image for IMAGE. Always null for CAROUSEL_ALBUM
    // (Meta only exposes a carousel's child media via the separate
    // /{media-id}/children edge, not requested here). thumbnail_url is the
    // cover-frame image, VIDEO/REELS only — prefer it over media_url there.
    // Also doubles as the resolved CAROUSEL_ALBUM cover (first child's
    // image/thumbnail, fetched separately via /{media-id}/children — see
    // lib/instagram/client.ts's fetchCarouselChildren), null if that call
    // fails or the album has no children.
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    mediaPublishedAt: timestamp("media_published_at", { withTimezone: true }).notNull(),
    // "reach" is primary/reliable; "impressions" is opportunistic-only — Meta
    // deprecated/restricted it for many organic media types around 2023.
    // NEVER hard-fail a fetch just because impressions is rejected.
    reach: integer("reach"),
    impressions: integer("impressions"),
    likeCount: integer("like_count"),
    commentsCount: integer("comments_count"),
    savedCount: integer("saved_count"),
    sharesCount: integer("shares_count"),
    // Meta's own composite metric (like+comment+share+save) — requested for
    // IMAGE/CAROUSEL_ALBUM/VIDEO (never STORY, Meta doesn't expose it there).
    totalInteractions: integer("total_interactions"),
    videoViews: integer("video_views"), // "plays" — VIDEO/REELS only
    avgWatchTimeMs: integer("avg_watch_time_ms"), // REELS only
    totalWatchTimeMs: integer("total_watch_time_ms"), // REELS only
    profileVisits: integer("profile_visits"),
    follows: integer("follows"),
    storyTapsForward: integer("story_taps_forward"),
    storyTapsBack: integer("story_taps_back"),
    storyExits: integer("story_exits"),
    storyReplies: integer("story_replies"),
    // Full API response passthrough — future-proofs any metric not yet
    // promoted to its own column, and is the audit trail if Meta's metric
    // names shift again.
    rawInsights: jsonb("raw_insights").notNull().$type<Record<string, unknown>>(),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("instagram_post_insights_user_media_idx").on(table.userId, table.mediaId),
    index("instagram_post_insights_user_published_idx").on(table.userId, table.mediaPublishedAt),
  ]
).enableRLS();

// YouTube connection — OAuth via Google (see lib/youtube/protocol.ts). Unlike
// Instagram's single long-lived token, Google issues a short-lived (~1h)
// access token ALONGSIDE a long-lived refresh token — refreshTokenEncrypted
// is only ever populated on first consent (or a re-consent that forces
// `prompt=consent`, see app/api/youtube/connect/route.ts), so accessToken is
// refreshed via it on every sync rather than on a days-long margin like
// Instagram's INSTAGRAM_TOKEN_REFRESH_MARGIN_DAYS. Owner-only, never
// delegable, same boundary as Stripe/iClosed/Calendly/Instagram.
export const youtubeConnections = pgTable("youtube_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  channelTitle: text("channel_title"), // display only ("Connecté en tant que [chaîne]")
  channelThumbnailUrl: text("channel_thumbnail_url"),
  // Channel-level snapshot from Data API channels.list, refreshed on every
  // sync — powers headline stat tiles without a separate aggregation query
  // over youtube_video_insights.
  subscriberCount: integer("subscriber_count"),
  viewCountTotal: integer("view_count_total"),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  // Granted OAuth scope — audit visibility only, mirrors stripeConnections.scope.
  scope: text("scope"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  // "pending" | "completed" | "failed" | "token_expired" — same
  // connection-health vocabulary as instagramConnections.initialSyncStatus.
  initialSyncStatus: text("initial_sync_status").notNull().default("pending"),
  initialSyncCompletedAt: timestamp("initial_sync_completed_at", { withTimezone: true }),
  lastAnalyticsSyncAt: timestamp("last_analytics_sync_at", { withTimezone: true }),
}).enableRLS();

// Full-fidelity raw cache — one row per YouTube video, every metric fetched
// from the Data API (metadata) + Analytics API (performance). content_posts
// only ever gets a projection of this (see lib/youtube/backfill.ts), same
// split as instagram_post_insights/content_posts. Re-fetched periodically
// (recurring cron, not just at connect) since watch-time/retention numbers
// keep evolving after publish, same rationale as Instagram's insights.
export const youtubeVideoInsights = pgTable(
  "youtube_video_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    // Watch time — the metric YouTube's own algorithm weighs most heavily
    // alongside impressions CTR below.
    estimatedMinutesWatched: integer("estimated_minutes_watched"),
    averageViewDurationSeconds: integer("average_view_duration_seconds"),
    // Audience retention, 0-100 — what YouTube uses to judge whether a video
    // is worth recommending. A raw API metric (not a business rate derived
    // from other columns), so it's stored as-is like every other insight
    // column here, consistent with CLAUDE.md's "compute rates in code" rule
    // which targets derived business rates, not passthrough API values.
    averageViewPercentage: real("average_view_percentage"),
    subscribersGained: integer("subscribers_gained"),
    subscribersLost: integer("subscribers_lost"),
    impressions: integer("impressions"),
    // 0-100 — thumbnail/suggested-video click-through rate. NOT the same
    // metric as content_posts.clicks (an outbound link click) — see
    // YOUTUBE_ORGANIC_CLICKS_AVAILABLE in lib/youtube/protocol.ts.
    impressionsClickThroughRate: real("impressions_click_through_rate"),
    // Full API response passthrough — future-proofs any metric not yet
    // promoted to its own column, and is the audit trail if the API surface
    // shifts (see protocol.ts's file-header disclaimer).
    rawInsights: jsonb("raw_insights").notNull().$type<Record<string, unknown>>(),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("youtube_video_insights_user_video_idx").on(table.userId, table.videoId),
    index("youtube_video_insights_user_published_idx").on(table.userId, table.publishedAt),
  ]
).enableRLS();

export const diagnostics = pgTable(
  "diagnostics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    // Placeholder until the full health-scoring model exists — sync jobs
    // that only compute a dollar figure (e.g. failed payments) write 0.
    score: integer("score").notNull(),
    // Cents, USD — integer to avoid float rounding on money. 42000 = $420.00.
    dollarsLost: integer("dollars_lost").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One row per category per user — sync jobs upsert on this to stay
    // idempotent across re-runs.
    uniqueIndex("diagnostics_user_category_idx").on(table.userId, table.category),
  ]
).enableRLS();

// Manually entered — no integration behind this one. One row per user per
// day; the manual form and the CSV import both upsert on (userId, date), so
// re-saving or re-importing a day overwrites it instead of duplicating.
export const settingKpiEntries = pgTable(
  "setting_kpi_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Which team member actually submitted this row, when it wasn't the
    // account owner — null for owner-entered rows and for every row that
    // predates team members. Set null (not cascaded) if that member is later
    // removed, so historical entries keep their date/values.
    enteredByUserId: uuid("entered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    newSubscribers: integer("new_subscribers").notNull(),
    firstMessagesSent: integer("first_messages_sent").notNull(),
    conversationsStarted: integer("conversations_started").notNull(),
    callsProposed: integer("calls_proposed").notNull(),
    callsBooked: integer("calls_booked").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("setting_kpi_entries_user_date_idx").on(table.userId, table.date),
  ]
).enableRLS();

// Same shape/upsert semantics as settingKpiEntries — manually entered, one
// row per user per day, (userId, date) upsert. callsAttended and salesClosed
// let /closing compute its own rate (closingRate) plus a no-show rate that
// also needs settingKpiEntries.callsBooked (a cross-table read, not stored
// here) over the same period.
export const closingKpiEntries = pgTable(
  "closing_kpi_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Same rationale as settingKpiEntries.enteredByUserId.
    enteredByUserId: uuid("entered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    callsAttended: integer("calls_attended").notNull(),
    salesClosed: integer("sales_closed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("closing_kpi_entries_user_date_idx").on(table.userId, table.date),
  ]
).enableRLS();

// The single source of truth for how a user's business actually works —
// niche, offers, acquisition channels, delivery. One row per user; other
// features (Dashboard €-lost, Funnel stages, Diagnostic, Agent IA) will read
// from this in later phases instead of duplicating any of this data. See
// lib/business/types.ts for the jsonb column shapes and lib/business/schema.ts
// for the Zod validation applied before every write.
export const businessProfile = pgTable("business_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  identity: jsonb("identity").notNull().$type<BusinessIdentity>(),
  acquisition: jsonb("acquisition").notNull().$type<BusinessAcquisition>(),
  sales: jsonb("sales").notNull().$type<BusinessSales>(),
  delivery: jsonb("delivery").notNull().$type<BusinessDelivery>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Every stage a funnel rate can come from — Setting (outreach → booking) and
// Closing (show-up, closing) combined. See lib/setting/funnel.ts / lib/closing/metrics.ts.
export const funnelStageEnum = pgEnum("funnel_stage", [
  "outreachRate",
  "responseRate",
  "proposalRate",
  "bookingRate",
  "showUpRate",
  "closingRate",
]);

// Append-only history — every AI-generated insight is kept (not overwritten
// on regeneration), so a user can look back at everything ever generated for
// a stage. implemented/implementedAt let the user mark whether they actually
// put a given insight into practice. keySource/inputTokens/outputTokens exist
// so the client can see their own consumption and so Scale X can track
// exposure on the shared fallback key (see lib/agent/quota.ts), per
// CLAUDE.md's BYOK logging rule.
export const funnelStageInsights = pgTable(
  "funnel_stage_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stage: funnelStageEnum("stage").notNull(),
    answers: jsonb("answers").notNull().$type<Record<string, string>>(),
    insightText: text("insight_text").notNull(),
    keySource: text("key_source").notNull(), // "byok" | "shared"
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // null = user hasn't said yet; true/false = their answer.
    implemented: boolean("implemented"),
    implementedAt: timestamp("implemented_at", { withTimezone: true }),
  },
  (table) => [index("funnel_stage_insights_user_idx").on(table.userId)]
).enableRLS();

// Monthly per-user counter, incremented only when the shared fallback key is
// used (BYOK calls cost Scale X nothing, so they're never counted here).
// periodMonth ("2026-07") doubles as the reset mechanism — a new month is
// simply a new row, no cron job needed.
export const sharedAgentUsage = pgTable(
  "shared_agent_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodMonth: text("period_month").notNull(),
    requestCount: integer("request_count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("shared_agent_usage_user_period_idx").on(table.userId, table.periodMonth),
  ]
).enableRLS();

// Manual monthly entry (the "/datas" page) — coexists with the daily
// settingKpiEntries/closingKpiEntries tables rather than replacing them.
// Every metric is nullable: null means "not entered", never coerced to 0
// (lib/monthly-metrics/completion.ts and lib/setting/funnel.ts's rate()
// both depend on that distinction). Rates and completion are never stored
// here — always computed live, per lib/monthly-metrics/rates.ts.
export const monthlyMetrics = pgTable(
  "monthly_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12
    cashCollected: integer("cash_collected"), // euros
    // "stripe" | "stripe_stale" | null (null = manual/unset) — set by
    // lib/stripe/sync.ts, never by the manual save path. "stale" means the
    // account disconnected (app/(app)/settings/actions.ts's disconnectStripe):
    // the value is kept as the last-known figure but manual entry reopens.
    // See lib/monthly-metrics/resolve.ts's resolveMonthCashCollected for the
    // read side, and app/(app)/datas/import-actions.ts for the write-block.
    cashCollectedSource: text("cash_collected_source"),
    cashCollectedSyncedAt: timestamp("cash_collected_synced_at", { withTimezone: true }),
    // The manual value that existed the FIRST time Stripe claimed this field
    // — captured once, never overwritten again (even on re-sync), per
    // CLAUDE.md's rule that a prior manual entry is never destroyed, only
    // masked.
    cashCollectedManualBackup: integer("cash_collected_manual_backup"),
    cashContracted: integer("cash_contracted"), // euros
    // Top-of-funnel leads/audience growth (newSubscribers in the Setting
    // funnel, see lib/monthly-metrics/rates.ts's toFunnelTotals) — NOT the
    // same concept as newCustomers below (Stripe's paying-customer count).
    // Deliberately never touched by the Stripe sync.
    newFollowers: integer("new_followers"),
    // Stripe's "nouveaux clients" (customers with ≥1 succeeded charge that
    // month) — a genuinely new field, no manual entry ever existed for this
    // (the old live-only lib/dashboard/stripe-metrics.ts computed it
    // on-the-fly and never persisted it), so unlike cashCollected there is no
    // manual value to ever preserve/backup.
    newCustomers: integer("new_customers"),
    newCustomersSource: text("new_customers_source"), // "stripe" | "stripe_stale" | null
    newCustomersSyncedAt: timestamp("new_customers_synced_at", { withTimezone: true }),
    firstMessages: integer("first_messages"),
    conversations: integer("conversations"),
    callsProposed: integer("calls_proposed"),
    callsBooked: integer("calls_booked"),
    callsTaken: integer("calls_taken"),
    salesClosed: integer("sales_closed"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("monthly_metrics_user_year_month_idx").on(table.userId, table.year, table.month),
  ]
).enableRLS();

// One row per COMMITTED smart-data-import (lib/import/, app/api/import/) —
// never written during analysis/clarification, only at actual commit or
// explicit abandon. Serves two purposes at once: (1) file-hash + month dedup
// ("tu as déjà importé ce fichier pour Mars") and (2) BYOK/shared token
// logging for this feature, same shape as funnelStageInsights's
// keySource/inputTokens/outputTokens (no shared token-logging helper exists
// in this repo yet — every AI-calling feature logs its own).
export const dataImportStatus = pgEnum("data_import_status", ["committed", "abandoned"]);

export const dataImports = pgTable(
  "data_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileHash: text("file_hash").notNull(),
    targetYear: integer("target_year"),
    targetMonth: integer("target_month"),
    status: dataImportStatus("status").notNull(),
    fieldsCount: integer("fields_count").notNull().default(0),
    monthsCount: integer("months_count").notNull().default(0),
    hadConflicts: boolean("had_conflicts").notNull().default(false),
    keySource: text("key_source").notNull(), // "byok" | "shared"
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("data_imports_user_hash_idx").on(table.userId, table.fileHash)]
).enableRLS();

// The 5 funnel rates the /diagnostic cascade engine can benchmark and
// simulate against — see lib/diagnostic/cascade.ts. Deliberately a single
// value per (sector, metric), not the 3-tier {bas,moyen,bon} band used by
// the older lib/benchmarks.ts (which keeps driving the Funnel's existing
// tiles/meters, untouched) — the two systems are different in shape on
// purpose, not an oversight; unifying them is separate follow-up work.
export const diagnosticMetricEnum = pgEnum("diagnostic_metric", [
  "responseRate",
  "proposalRate",
  "bookingRate",
  "showUpRate",
  "closingRate",
  // Content mini-funnel (views -> clicks -> leads) — separate from the
  // 5-stage sales cascade above, see lib/content-posts/rates.ts.
  "content_click_rate",
  "content_lead_rate",
  // Pipeline Kanban (leads travaillés -> closés) — a different denominator
  // than closingRate above (which starts from calls attended, not leads
  // entering the pipeline), see lib/diagnostic/pipeline-metrics.ts.
  "pipeline_closing_rate",
]);

// Lives in DB so values are adjustable without a redeploy, and so they can
// later be replaced by real cross-user averages per sector. No user-facing
// write path exists yet — seeded once via scripts/seed-benchmarks.ts.
// sector: null = the global fallback row for that metric.
export const benchmarks = pgTable("benchmarks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sector: prospectionSector("sector"),
  metricKey: diagnosticMetricEnum("metric_key").notNull(),
  value: real("value").notNull(), // 0-1 fraction
}).enableRLS();

export const contentPostType = pgEnum("content_post_type", [
  "post",
  "reel",
  "story",
  "video",
  "live",
]);

// Manual entry (the "/acquisition/contenu" page) by default, now also
// auto-populated from Instagram — one row per post. Rates (engagement/click/
// view-to-lead) are never stored, always computed on read from these counts
// — see lib/content-posts/rates.ts.
export const contentPosts = pgTable(
  "content_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    type: contentPostType("type").notNull(),
    title: text("title").notNull(),
    publishedAt: date("published_at", { mode: "string" }).notNull(),
    url: text("url"),
    views: integer("views").notNull(),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    // Never coerced to a measured 0 when unmeasurable — see
    // lib/content-posts/rates.ts's null-safe clickRate. Organic Instagram
    // posts NEVER get a value here (Meta's API exposes no per-post organic
    // click count), so this stays null for every synced Instagram row.
    clicks: integer("clicks"),
    leads: integer("leads"),
    // "manual" | "instagram" — mirrors salesCalls.source's multi-source
    // pattern. externalId is the Instagram media id when source="instagram"
    // (points at instagram_post_insights.mediaId), null for manual rows.
    // Rows with source != "manual" are never hand-edited/deleted (enforced
    // in lib/content-posts/queries.ts, not just hidden in the UI) — a resync
    // upserts them instead.
    source: text("source").notNull().default("manual"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("content_posts_user_published_idx").on(table.userId, table.publishedAt),
    uniqueIndex("content_posts_user_source_external_idx").on(table.userId, table.source, table.externalId),
  ]
).enableRLS();

export const salePaymentType = pgEnum("sale_payment_type", ["one_shot", "installments"]);

// --- Pipeline Acquisition (Kanban leads) + Setters + commissions ---------
// setters/leads/sales are mutually referential (leads.setterId -> setters,
// leads.saleId -> sales, sales.leadId -> leads) — Drizzle's `.references(()
// => table.column)` callbacks are lazy, so the circular pair (leads <->
// sales) resolves fine regardless of declaration order; setters is declared
// first purely for readability since nothing references it in reverse.

export const setters = pgTable(
  "setters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    // 0-1 fraction, same convention as benchmarks.value — used as the
    // fallback commission % whenever the sold offer has no
    // commissionSetterPct of its own (business_profile.sales.offers).
    defaultCommissionPct: real("default_commission_pct").notNull().default(0.1),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("setters_user_idx").on(table.userId)]
).enableRLS();

export const leadSourceEnum = pgEnum("lead_source", [
  "instagram", "tiktok", "youtube", "linkedin", "x", "facebook",
  "email_newsletter", "ads", "bouche_a_oreille", "autre",
]);

export const leadStageEnum = pgEnum("lead_stage", [
  "nouveau_lead", "conversation", "rdv_fixe", "rdv_honore", "close", "perdu",
]);

export const leadLostReasonEnum = pgEnum("lead_lost_reason", [
  "pas_le_budget", "pas_le_moment", "concurrent", "ghoste", "autre",
]);

// The "/acquisition/pipeline" Kanban — replaces the old Setting KPI-entry
// page in the visible UX (settingKpiEntries/lib/setting/funnel.ts are
// untouched, still feed the diagnostic cascade independently of this).
// offerId refers to business_profile.sales.offers by id, same
// text-not-FK convention as sales.offerId, for the same reason (no
// relational offers table exists). closer is free text, same decision as
// sales.closer (no closers table — see that column's own comment below).
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    source: leadSourceEnum("source").notNull(),
    offerId: text("offer_id"),
    potentialValueEur: integer("potential_value_eur").notNull().default(0), // pre-filled from offer.price, editable
    setterId: uuid("setter_id").references(() => setters.id, { onDelete: "set null" }),
    closer: text("closer"),
    stage: leadStageEnum("stage").notNull().default("nouveau_lead"),
    // A STATUS on an "rdv_fixe" lead (red badge, recoverable back into
    // "conversation") — deliberately NOT a terminal stage/column.
    isNoShow: boolean("is_no_show").notNull().default(false),
    lostReason: leadLostReasonEnum("lost_reason"),
    // Set once the lead is won and a sales row exists — the lead POINTS at
    // the sale, never duplicates its fields ("no double entry" rule).
    // Explicit AnyPgColumn return type breaks the leads<->sales circular
    // type-inference (each references the other) — same fix TS requires
    // for any mutually-referential pair of Drizzle tables.
    saleId: uuid("sale_id").references((): AnyPgColumn => sales.id, { onDelete: "set null" }),
    // Single active follow-up reminder — visual pastille only (no
    // cron/email notification infra exists in this codebase, and none is
    // built for this chantier, per explicit product decision).
    reminderDate: date("reminder_date", { mode: "string" }),
    reminderNote: text("reminder_note"),
    reminderDone: boolean("reminder_done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leads_user_stage_idx").on(table.userId, table.stage),
    index("leads_user_created_idx").on(table.userId, table.createdAt),
    index("leads_setter_idx").on(table.setterId),
  ]
).enableRLS();

// Append-only stage-change log ("historique de progression horodaté") — a
// real table, not a jsonb array on `leads`: rendered as its own ordered
// timeline in the lead drawer, queried independently of the rest of the
// lead — unlike sales.installments (jsonb) which is never queried outside
// its own sale.
export const leadStageHistory = pgTable(
  "lead_stage_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    fromStage: leadStageEnum("from_stage"), // null on the row created at lead creation
    toStage: leadStageEnum("to_stage").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lead_stage_history_lead_idx").on(table.leadId, table.changedAt)]
).enableRLS();

// Comment thread per lead — same "own table, independently rendered/
// queried" reasoning as leadStageHistory above.
export const leadComments = pgTable(
  "lead_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // author
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lead_comments_lead_idx").on(table.leadId, table.createdAt)]
).enableRLS();

// Manual entry (the "/ventes/suivi" page). offerId refers to an id inside
// business_profile.sales.offers (jsonb, no relational table) so it's plain
// text, not a FK. installments is a jsonb array — same "array-in-jsonb"
// pattern as business_profile.sales.offers, since an installment schedule
// never needs to be queried/filtered independently of its sale — see
// lib/sales/types.ts for its shape.
export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email"),
    sourceChannel: text("source_channel"),
    offerId: text("offer_id"),
    totalPrice: integer("total_price").notNull(), // euros
    paymentType: salePaymentType("payment_type").notNull(),
    installments: jsonb("installments").$type<SaleInstallment[]>(),
    saleDate: date("sale_date", { mode: "string" }).notNull(),
    closer: text("closer"),
    // Optional per-sale upsell (checkbox in the existing sale-form-dialog.tsx
    // — never a separate entry point/table, per the "no double entry" rule).
    // upsellOfferId refers to business_profile.sales.offers, same
    // text-not-FK convention as offerId above.
    hasUpsell: boolean("has_upsell").notNull().default(false),
    upsellOfferId: text("upsell_offer_id"),
    upsellAmount: integer("upsell_amount"), // euros
    // Pipeline tie-in (Kanban "Closé" -> sale validation modal writes here):
    // setterId resolves commission attribution (lib/setters/queries.ts),
    // leadId is the reverse link back to the originating lead (leads.saleId
    // is the forward link) — both nullable since most sales still come from
    // the plain manual /ventes/suivi form, not the pipeline.
    setterId: uuid("setter_id").references(() => setters.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references((): AnyPgColumn => leads.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sales_user_sale_date_idx").on(table.userId, table.saleDate),
    index("sales_setter_idx").on(table.setterId),
    index("sales_lead_idx").on(table.leadId),
  ]
).enableRLS();

// Attendance is iClosed-driven (webhook lifecycle: a call is booked, then the
// invitee shows or not, or the call is cancelled). Outcome is what the CLOSER
// marks by hand (V1 is manual, per product decision) — pending until then.
export const salesCallAttendance = pgEnum("sales_call_attendance", [
  "booked",
  "showed",
  "no_show",
  "cancelled",
]);
export const salesCallOutcome = pgEnum("sales_call_outcome", [
  "pending",
  "closed",
  "not_closed",
  // Attended, no decision yet — waiting on the prospect. Transitional: resolves
  // to closed/not_closed. When set, decisionDueAt holds the expected answer date.
  "awaiting_decision",
]);

// The "Suivi des appels" funnel (the /ventes/appels tab). One row per iClosed
// call. Bookings are created automatically from the iClosed "Call Booked"
// webhook (lib/inngest/functions/sync-iclosed-account.ts +
// app/api/webhooks/iclosed); attendance/outcome are set by hand. MONEY is never
// stored here: when a call is marked "closed", a linked sales row is created and
// saleId points at it (same "no double entry" rule as leads.saleId) so the
// amount flows into the existing /ventes/suivi CA.
export const salesCalls = pgTable(
  "sales_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // iClosed's own call id — unique per user so a replayed webhook / backfill
    // upserts the same row instead of duplicating (webhook idempotency).
    iclosedCallId: text("iclosed_call_id").notNull(),
    inviteeName: text("invitee_name"),
    inviteeEmail: text("invitee_email"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    // Free text, same convention as sales.closer / leads.closer (no closers
    // table exists in this codebase).
    closer: text("closer"),
    // Nullable link to the setter who booked the call, when resolvable — same
    // attribution role as sales.setterId.
    setterId: uuid("setter_id").references(() => setters.id, { onDelete: "set null" }),
    // Booking page / call type — free text label (iClosed event name, or
    // Calendly scheduled_event name).
    eventType: text("event_type"),
    // Which call-booking tool this row came from — the /ventes/appels funnel is
    // multi-source. Defaults to "iclosed" (the first integration); "calendly"
    // for Calendly-sourced calls. iclosedCallId holds the source's external id
    // (an iClosed numeric id, or a Calendly scheduled_event URI) — kept under
    // that name to avoid a risky rename of the existing unique index.
    source: text("source").notNull().default("iclosed"),
    attendance: salesCallAttendance("attendance").notNull().default("booked"),
    outcome: salesCallOutcome("outcome").notNull().default("pending"),
    // Set once the call is marked "closed" — POINTS at the sale, never
    // duplicates its amount (contracté = sales.totalPrice).
    saleId: uuid("sale_id").references((): AnyPgColumn => sales.id, { onDelete: "set null" }),
    // When the closer last set attendance/outcome by hand (null while pending).
    outcomeSetAt: timestamp("outcome_set_at", { withTimezone: true }),
    // Expected answer date while outcome is "awaiting_decision" — drives the
    // "Décisions en attente" list + its urgency colour. Cleared when the call
    // leaves the awaiting state (null otherwise).
    decisionDueAt: timestamp("decision_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sales_calls_user_iclosed_call_idx").on(table.userId, table.iclosedCallId),
    index("sales_calls_user_scheduled_idx").on(table.userId, table.scheduledAt),
    index("sales_calls_setter_idx").on(table.setterId),
    index("sales_calls_sale_idx").on(table.saleId),
  ]
).enableRLS();

// Comment thread per call — append-only history (objections, follow-ups,
// context), same "own table, independently queried" reasoning as leadComments.
export const salesCallComments = pgTable(
  "sales_call_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id")
      .notNull()
      .references(() => salesCalls.id, { onDelete: "cascade" }),
    // Author = the individual who wrote it (the logged-in userId, NOT accountId)
    // — same "who did this" convention as leadComments.userId, so a team member's
    // comments stay attributed to them and are the only ones they can delete.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sales_call_comments_call_idx").on(table.callId, table.createdAt)]
).enableRLS();

export const closingVideoOutcome = pgEnum("closing_video_outcome", ["closed", "not_closed", "pending"]);

// Manual entry (the "/ventes/videos" page) — one row per closing call.
// transcript/notes are pasted in by hand (no Whisper/audio-upload pipeline
// in this codebase — url is an external link to wherever the recording is
// hosted). Feeds lib/call-analysis-prompt-builder.ts for the "Analyser cet
// appel" AI chat; deliberately not wired into Diagnostic (see plan doc —
// an outcome win-rate tile would duplicate the existing closingRate metric).
export const closingVideos = pgTable(
  "closing_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientName: text("client_name").notNull(),
    callDate: date("call_date", { mode: "string" }).notNull(),
    url: text("url"),
    transcript: text("transcript"),
    notes: text("notes"),
    outcome: closingVideoOutcome("outcome").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("closing_videos_user_call_date_idx").on(table.userId, table.callDate)]
).enableRLS();

// Manual entry (the "/acquisition/ads" page) — one row per ad campaign.
// Rates (CTR, cost per lead/click) are never stored, always computed on
// read — see lib/ad-campaigns/metrics.ts. Not wired into Diagnostic: no
// existing CPL/CTR benchmark data exists to compare against.
export const adCampaigns = pgTable(
  "ad_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    budget: integer("budget"), // euros
    spend: integer("spend"), // euros
    impressions: integer("impressions"),
    clicks: integer("clicks"),
    leads: integer("leads"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ad_campaigns_user_start_date_idx").on(table.userId, table.startDate)]
).enableRLS();

// Manual entry (the "/acquisition/mail" page) — one row per email campaign.
// Rates (open rate, CTR) are never stored, always computed on read — see
// lib/email-campaigns/metrics.ts. Parallel module, same pattern as
// content_posts/ad_campaigns: not wired into the cascade.ts diagnostic
// engine or Scale Score (see lib/diagnostic/content-metrics.ts's own
// comment on why an external source stays separate).
export const emailCampaigns = pgTable(
  "email_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sentAt: date("sent_at", { mode: "string" }).notNull(),
    subject: text("subject"),
    sends: integer("sends").notNull(),
    opens: integer("opens"),
    clicks: integer("clicks"),
    revenueAttributed: integer("revenue_attributed"), // euros
    bookings: integer("bookings"), // RDV bookés attribués à cet envoi
    dealsClosed: integer("deals_closed"), // RDV closés (ventes) attribués à cet envoi
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("email_campaigns_user_sent_at_idx").on(table.userId, table.sentAt)]
).enableRLS();

// --- Plans de démarrage (mode "Démarrer" des pages leviers) -----------------
// Content lives in DB (editable without redeploy, same jsonb-array
// convention as leversCatalog.questions) — seeded via
// scripts/seed-lever-starter-plans.mjs, same pattern as
// scripts/seed-levers-catalog.mjs.

export const leverStarterPlans = pgTable("lever_starter_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  leverKey: text("lever_key").notNull().unique(),
  // detail/estTime are optional — older/unenriched plans just render a bare
  // title, same "degrade gracefully" rule as everything else content-curated
  // in this feature (see /demarrer/[leverKey]).
  steps: jsonb("steps").notNull().$type<{ order: number; title: string; detail?: string; estTime?: string }[]>(),
}).enableRLS();

// Per-ACCOUNT progress on a starter plan — separate from the content above
// since which steps are checked is account state, not catalog config.
export const leverStarterProgress = pgTable(
  "lever_starter_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leverKey: text("lever_key").notNull(),
    completedSteps: jsonb("completed_steps").notNull().default([]).$type<number[]>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.leverKey] })]
).enableRLS();

// Curated YouTube videos for the /demarrer/[leverKey] guide page — manually
// picked (never auto-searched, per the "Démarrer un levier" brief's explicit
// "pas de recherche YouTube automatique" rule), seeded via
// scripts/seed-lever-resources.mjs. Title/channel/thumbnail are NOT stored
// here — fetched live from YouTube's public oEmbed endpoint at render time
// (no API key needed), so they never go stale if a video is renamed;
// durationLabel is the one field oEmbed can't provide, so it's curated by
// hand alongside the URL.
export const leverResources = pgTable(
  "lever_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leverKey: text("lever_key").notNull(),
    youtubeUrl: text("youtube_url").notNull(),
    durationLabel: text("duration_label"),
    lang: text("lang").notNull().default("fr"),
    sortOrder: integer("sort_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [index("lever_resources_lever_key_idx").on(table.leverKey)]
).enableRLS();

// --- Agents spécialisés par levier (Copilote Groq) --------------------------
// Config data, not code — one row per lever/page-specific agent persona,
// editable without a redeploy, seeded via scripts/seed-agents-registry.mjs
// (same pattern as leversCatalog/leverStarterPlans). leverKey is only set
// for the 3 agents backed by a real levers_catalog entry (email_marketing,
// ads, upsell_ascension) — content/setting/closing/produits have none, they
// pull their "données du levier" block from other existing sources instead
// (see lib/agent/lever-agent-data.ts). falcoSkinAssetKey stays null until
// real per-agent Falco illustrations exist — falcoSkinIcon (a lucide-react
// key) is the shipped badge in the meantime. provider defaults to "groq" and
// is not read anywhere yet — reserved for the discussed Claude-vs-Llama A/B,
// architecture-ready, feature OFF.
export const agentsRegistry = pgTable("agents_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentKey: text("agent_key").notNull().unique(),
  leverKey: text("lever_key"),
  name: text("name").notNull(),
  falcoSkinIcon: text("falco_skin_icon").notNull(),
  falcoSkinAssetKey: text("falco_skin_asset_key"),
  systemPromptTemplate: text("system_prompt_template").notNull(),
  temperature: real("temperature").notNull().default(0.7),
  provider: text("provider").notNull().default("groq"),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// One Falco, many chapters — replaces the old "one eternal thread per
// agentKey" model. topicType/topicKey/topicLabel are fixed at creation
// (same ChatContext shape as before, just stored on the conversation row
// instead of implied by which agentKey a message was written under).
// title is the "chapter" name shown in the history panel — a deterministic
// template (see lib/agent/chat-history.ts), never AI-generated, filled in
// once the first real exchange completes (not the auto-opening greeting).
// resolved is a manual/future flag (not set anywhere yet in this chantier)
// for a "still needs attention" indicator in the history list.
export const conversationTopicType = pgEnum("conversation_topic_type", ["general", "lever"]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    topicType: conversationTopicType("topic_type").notNull(),
    topicKey: text("topic_key"), // null for "general"
    topicLabel: text("topic_label"), // null for "general" — stored so display never depends on a lookup table that could drift later
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("conversations_user_updated_idx").on(table.userId, table.updatedAt)]
).enableRLS();

// Persisted per conversation — unlike the rest of the Copilote (metric
// topics stay ephemeral, never get a conversation row at all), lever/
// general chats survive across opens. Capped at MAX_MESSAGES (20, same
// constant as app/api/improve-chat/route.ts) by simply never inserting past
// it — the route's existing "conversation full" check already stops new
// sends at that point, so nothing here needs to prune. `agentKey` stays
// (always "falco" going forward) as a harmless legacy/debugging column,
// not the identity key anymore — `conversationId` is.
export const agentChatMessages = pgTable(
  "agent_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    agentKey: text("agent_key").notNull(),
    role: text("role").notNull(), // "user" | "assistant"
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_chat_messages_user_agent_idx").on(table.userId, table.agentKey, table.createdAt),
    index("agent_chat_messages_conversation_idx").on(table.conversationId, table.createdAt),
  ]
).enableRLS();

// --- Team members, roles & permissions --------------------------------------
// No separate "accounts" table: an account IS its owner's users.id (see
// lib/team/context.ts). Every existing *KpiEntries-style table keeps scoping
// by userId, which for a team member now means "the account they're acting
// on behalf of", resolved server-side — never the member's own id.

// One row per (account, role). Deliberately not a pg enum: an owner can
// rename/re-scope a role's permissions after the fact without a migration.
// permissions is a jsonb array of the fixed keys in lib/team/permissions.ts.
// 3 default roles ("setting", "closing", "financier") are seeded lazily the
// first time an owner opens the Équipe/Rôles screens.
export const teamRoles = pgTable(
  "team_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    permissions: jsonb("permissions").notNull().$type<string[]>().default([]),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("team_roles_account_key_idx").on(table.accountId, table.key)]
).enableRLS();

export const teamMemberStatus = pgEnum("team_member_status", ["invited", "active", "removed"]);

// One row per invited person per account. memberUserId stays null until the
// invite is accepted — the invited person may not have a Supabase Auth
// account yet, so email is the stable identifier before that. inviteToken is
// cleared once accepted so a used invite link can never be replayed.
export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberUserId: uuid("member_user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: teamMemberStatus("status").notNull().default("invited"),
    inviteToken: text("invite_token").unique(),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("team_members_account_email_idx").on(table.accountId, table.email),
    index("team_members_member_user_idx").on(table.memberUserId),
  ]
).enableRLS();

// Join table: a member can hold several roles at once (e.g. "setting" +
// "closing"). No surrogate id — the (teamMemberId, roleId) pair is the
// identity, enforced as the actual primary key.
export const teamMemberRoles = pgTable(
  "team_member_roles",
  {
    teamMemberId: uuid("team_member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => teamRoles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.teamMemberId, table.roleId] })]
).enableRLS();

// --- Scale X's own SaaS billing ---------------------------------------------
// Distinct from Stripe Connect above (stripeConnections), which only reads a
// CLIENT's Stripe account. This is Scale X's platform Stripe account,
// billing the infopreneur — see lib/stripe/platform-client.ts.

// Admin-editable via /admin/plans. features is a jsonb bag rather than fixed
// columns so new gated capabilities can be added later without a migration —
// today only teamMembersEnabled/maxTeamMembers are read, see
// lib/billing/plan-gate.ts.
export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  priceMonthlyCents: integer("price_monthly_cents").notNull(),
  // Null until the plan has been saved once — a Stripe Price is created on
  // save (app/admin/plans/actions.ts). Prices are immutable in Stripe:
  // changing the amount later creates a NEW Price and archives the old one,
  // then swaps this pointer, rather than mutating a Price in place.
  stripePriceId: text("stripe_price_id"),
  features: jsonb("features").notNull().$type<Record<string, unknown>>().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// One row per account (unique userId) — mirrors the account owner's Stripe
// subscription state, kept in sync by the webhook. status is plain text, not
// a pg enum: it mirrors Stripe's own status vocabulary directly ("active",
// "trialing", "past_due", "canceled", ...), which Stripe can extend on its
// own timeline, and this repo has no versioned migrations to ALTER TYPE
// against (schema changes only go through `db:push`) — validated with Zod at
// the webhook boundary instead, per CLAUDE.md's external-data rule.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    status: text("status").notNull().default("incomplete"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("subscriptions_plan_idx").on(table.planId)]
).enableRLS();

// Idempotency ledger for the Stripe billing webhook
// (app/api/webhooks/stripe-billing/route.ts) — the first Stripe webhook in
// this codebase, so there's no existing table to extend. id is Stripe's own
// event.id: inserting it is the atomic "have I seen this before" check (a
// unique PK conflict means it was already processed).
export const processedStripeEvents = pgTable("processed_stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Idempotency ledger for the iClosed webhook (app/api/webhooks/iclosed/
// [token]/route.ts) — same pattern as processed_stripe_events above: id is
// iClosed's own event id, inserting it is the atomic "already processed?" check.
export const processedIclosedEvents = pgTable("processed_iclosed_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Idempotency ledger for the Calendly webhook. Calendly deliveries carry no
// stable top-level event id, so the id here is a synthetic "<event>:<inviteeUri>"
// (an invitee fires invitee.created once and invitee.canceled once).
export const processedCalendlyEvents = pgTable("processed_calendly_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// One row per user per day, written by the daily snapshot cron
// (lib/inngest/functions/snapshot-scale-score.ts) — only when a score was
// actually computable (see lib/diagnostic/scale-score.ts's ≥2-pillars-
// covered rule). The sidebar badge/modal NEVER read the current score from
// here — they always recompute live from the same engine the cron uses.
// This table exists purely so "the score 7/30 days ago" and the 8-week
// sparkline are answerable at all, which requires having persisted a point
// on that day.
export const scaleScoreHistory = pgTable(
  "scale_score_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    score: integer("score").notNull(), // 0-100
  },
  (table) => [uniqueIndex("scale_score_history_user_date_idx").on(table.userId, table.date)]
).enableRLS();

// One snapshot per (user, weekStart) — weekStart is the Monday of the week
// being SUMMARIZED (the week that just ended), not the Monday the job runs.
// Written exclusively by lib/inngest/functions/weekly-brief-email.ts's Monday
// cron (the same run that sends the email) — no on-demand generation path,
// so there is only ever one place this data comes from. statsSnapshot/
// bottleneck are jsonb, typed via lib/dashboard/weekly-report.ts's
// WeeklyReportStatCard/WeeklyReportBottleneck — same "config/snapshot data,
// not a rigid column-per-field schema" convention as levers_catalog.
// formulaParams/priorityRules.params.
export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    statsSnapshot: jsonb("stats_snapshot").notNull().$type<WeeklyReportStatCard[]>(),
    // null = no chiffrable bottleneck that week (e.g. everything at benchmark).
    bottleneck: jsonb("bottleneck").$type<WeeklyReportBottleneck | null>(),
    score: integer("score"), // Scale Score at generation time, null if not computable
    scoreDelta: integer("score_delta"), // vs 7 days before, null if no history yet
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("weekly_reports_user_week_idx").on(table.userId, table.weekStart)]
).enableRLS();

// --- Découverte (module de leviers non exploités) -----------------------
// Deliberately NOT branched into the cascade engine's MetricKey (see
// lib/diagnostic/cascade.ts) — that union is a sequential funnel
// simulation (CASCADE_ORDER/simulateSales), and email/webinar/optin rates
// aren't another stage of that SAME funnel. This is a parallel, independent
// scoring path — see lib/levers/opportunities.ts.

export const leverFormulaType = pgEnum("lever_formula_type", [
  "leads_x_rate_x_closing_x_price",
  "clients_x_takerate_x_price_fraction",
  // Absent-case formulas for the two highest-leverage acquisition/vente
  // levers — see lib/levers/opportunities.ts's estimateAdsAbsent/
  // estimateVslAbsent. Both produce a range (impactRangeEur), not just a
  // point estimate, given the higher uncertainty of an untested channel.
  "ads_test_budget_x_closing_x_price",
  "traffic_uplift_x_price",
  "none",
]);

// Config data, not code — seeded via scripts/seed-levers-catalog.mjs (same
// pattern as scripts/seed-benchmarks.mjs), editable/extensible without a
// redeploy for any lever using an EXISTING formulaType. A genuinely new
// formula SHAPE still requires code in lib/levers/opportunities.ts.
export const leversCatalog = pgTable("levers_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  leverKey: text("lever_key").notNull().unique(),
  label: text("label").notNull(),
  category: text("category").notNull(), // "acquisition" | "vente" | "delivrabilite"
  // [] for the 4 levers resolved from business_profile instead (see
  // lib/levers/catalog.ts's resolveFromBusinessProfile) — never asked twice.
  questions: jsonb("questions").notNull().$type<{ key: string; prompt: string; kind: "yes_no_notyet" | "stat_number" | "stat_text" | "select"; unit?: string; options?: string[] }[]>(),
  readsFromProfile: boolean("reads_from_profile").notNull().default(false),
  benchmarkValue: real("benchmark_value"), // 0-1 fraction; null = no comparable stat
  benchmarkStatKey: text("benchmark_stat_key"), // which businessLevers.stats key the benchmark applies to
  formulaType: leverFormulaType("formula_type").notNull().default("none"),
  formulaParams: jsonb("formula_params").notNull().default({}).$type<Record<string, number>>(),
  effort: text("effort").notNull(), // "faible" | "moyen" | "eleve"
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true), // soft-disable without deleting
  // Both null until curated for a given lever (see /demarrer/[leverKey] —
  // its "C'est quoi, concrètement" section is hidden entirely when
  // explanation is null, never a generated-on-the-fly placeholder).
  explanation: text("explanation"), // markdown, curated copy
  estTimeLabel: text("est_time_label"), // free text, e.g. "30-45 min" or "1-2 semaines"
}).enableRLS();

export const leverStatus = pgEnum("lever_status", ["active", "absent", "not_answered"]);

// One row per (user, lever) once resolved — the 4 profile-backed levers
// never get a row here (single source of truth stays business_profile).
export const businessLevers = pgTable(
  "business_levers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leverKey: text("lever_key").notNull(),
    status: leverStatus("status").notNull().default("not_answered"),
    stats: jsonb("stats").notNull().default({}).$type<Record<string, number | string>>(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("business_levers_user_lever_idx").on(table.userId, table.leverKey)]
).enableRLS();

// --- Priorisation intelligente (Diagnostic) ------------------------------
// Config data, not code — seeded via scripts/seed-priority-rules.mjs (same
// pattern as scripts/seed-levers-catalog.mjs). `condition` is a closed enum
// (not a free-form/eval'd expression), dispatched by a plain switch in
// lib/diagnostic/priority.ts — same precedent as leverFormulaType above.
// Expected `params` keys per condition (flat jsonb, same shape convention as
// leversCatalog.formulaParams):
//   lever_revenue_gate            -> { leverKey: string, revenueThresholdEur: number }
//   lever_requires_main_offer     -> { leverKey: string }
//   metric_near_benchmark         -> { gapThresholdFraction: number }
//   top_funnel_when_closing_leaks -> { closingGapThresholdFraction: number }
//   quick_win_low_effort          -> { minGainEur: number }
export const priorityRuleCondition = pgEnum("priority_rule_condition", [
  "lever_revenue_gate",
  "lever_requires_main_offer",
  "metric_near_benchmark",
  "top_funnel_when_closing_leaks",
  "quick_win_low_effort",
]);

export const priorityRules = pgTable("priority_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  condition: priorityRuleCondition("condition").notNull(),
  params: jsonb("params").notNull().default({}).$type<Record<string, number | string>>(),
  // Multiplier applied to a candidate's pertinence when this rule's
  // condition matches — <1 demotes, >1 boosts (product of all matching
  // rules capped at 1 in code, never in the DB).
  factor: real("factor").notNull(),
  reasonTemplate: text("reason_template").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// --- Journal de bord (calendrier + to-do + projets) -------------------------
// Calendar auto-populates from improvement_events + the existing daily
// setting/closing tables — the only manual input on this whole page is the
// free-text daily note. No new metric-entry surface (CLAUDE.md's
// simplification rule): monthly_metrics/setting_kpi_entries/
// closing_kpi_entries stay canonical for numbers.

export const projectStatus = pgEnum("project_status", ["active", "done"]);

export type ProjectMilestone = { order: number; title: string; done: boolean; doneAt: string | null };

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // "acquisition" | "vente" | "delivrabilite" | "autre" — plain text, same
    // convention as leversCatalog.category/diagnostics.category (no real pg
    // enum exists in this repo for this value set).
    category: text("category").notNull(),
    deadline: date("deadline", { mode: "string" }),
    milestones: jsonb("milestones").notNull().default([]).$type<ProjectMilestone[]>(),
    status: projectStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("projects_user_idx").on(table.userId)]
).enableRLS();

// projectId is nullable — most tasks are personal, never touching the
// journal (see isBusinessImprovement below). onDelete "set null" so
// deleting a project doesn't wipe out someone's to-do history.
export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    dueDate: date("due_date", { mode: "string" }),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    // OFF by default — per the brief, personal errands must never silently
    // pollute the journal's improvement log. Only an explicit toggle (or
    // linking to a project) makes a completed task count as an event.
    isBusinessImprovement: boolean("is_business_improvement").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("todos_user_idx").on(table.userId)]
).enableRLS();

// One row per (user, date) — the day's free-text note, the only manual
// field on the whole Journal page.
export const journalNotes = pgTable(
  "journal_notes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    content: text("content").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.date] })]
).enableRLS();

export const improvementEventType = pgEnum("improvement_event_type", [
  "insight_implemented",
  "project_milestone_completed",
  "todo_business_improvement",
  "checkin_rate_improved",
  "lever_activated",
  "copilote_started",
]);

// The Journal calendar's single read source (✦ marker + "Ce que tu as
// amélioré" in the day drawer) — written at the moment each of the 6
// source events happens (see lib/funnel-insights/insight-actions.ts,
// app/(app)/dashboard/actions.ts, app/(app)/diagnostic/discovery-actions.ts,
// lib/improve-chat-tracking.ts, and this feature's own actions.ts for
// milestones/todos). Never written to directly by a user — it aggregates.
// `date` is the day it should appear under on the calendar, not necessarily
// the same as createdAt (kept identical in practice, but named separately
// for clarity since they're conceptually different fields).
export const improvementEvents = pgTable(
  "improvement_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    type: improvementEventType("type").notNull(),
    label: text("label").notNull(),
    // Free-form pointer back to the originating record (insight id,
    // "projectId:milestoneOrder", todo id, metricKey, leverKey) — never a
    // real FK since it points at different tables depending on `type`.
    sourceId: text("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("improvement_events_user_date_idx").on(table.userId, table.date)]
).enableRLS();
