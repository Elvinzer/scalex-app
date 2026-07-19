import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  BusinessAcquisition,
  BusinessDelivery,
  BusinessIdentity,
  BusinessSales,
} from "@/lib/business/types";
import type { SaleInstallment } from "@/lib/sales/types";

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
});

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
});

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
);

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
);

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
);

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
});

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
);

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
);

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
    cashContracted: integer("cash_contracted"), // euros
    newFollowers: integer("new_followers"),
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
);

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
  // Testimonials collected / sales closed — see lib/diagnostic/delivery-metrics.ts.
  "testimonial_rate",
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
});

export const contentPostType = pgEnum("content_post_type", [
  "post",
  "reel",
  "story",
  "video",
  "live",
]);

// Manual entry (the "/acquisition/contenu" page) — one row per published
// post. Rates (engagement/click/view-to-lead) are never stored, always
// computed on read from these counts — see lib/content-posts/rates.ts.
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
    clicks: integer("clicks"),
    leads: integer("leads"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("content_posts_user_published_idx").on(table.userId, table.publishedAt)]
);

export const testimonialFormat = pgEnum("testimonial_format", ["texte", "video", "capture_ecran", "audio"]);

// Manual entry (the "/delivrabilite/temoignages" page) — one row per
// testimonial collected. Distinct from business_profile.delivery.testimonials
// (a static declared count/channel-list edited in Mon business) — this table
// is the operational log the two deliberately coexist, not a replacement.
// url is an external link only (Loom, screenshot host...) — no file-upload
// infra exists in this codebase yet.
export const testimonials = pgTable(
  "testimonials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientName: text("client_name").notNull(),
    format: testimonialFormat("format").notNull(),
    content: text("content"),
    url: text("url"),
    collectedAt: date("collected_at", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("testimonials_user_collected_idx").on(table.userId, table.collectedAt)]
);

export const salePaymentType = pgEnum("sale_payment_type", ["one_shot", "installments"]);

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sales_user_sale_date_idx").on(table.userId, table.saleDate)]
);

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
);

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
);
