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
}).enableRLS();

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
).enableRLS();

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
export const subscriptions = pgTable("subscriptions", {
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
}).enableRLS();

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

// --- Découverte (module de leviers non exploités) -----------------------
// Deliberately NOT branched into the cascade engine's MetricKey (see
// lib/diagnostic/cascade.ts) — that union is a sequential funnel
// simulation (CASCADE_ORDER/simulateSales), and email/webinar/optin rates
// aren't another stage of that SAME funnel. This is a parallel, independent
// scoring path — see lib/levers/opportunities.ts.

export const leverFormulaType = pgEnum("lever_formula_type", [
  "leads_x_rate_x_closing_x_price",
  "clients_x_takerate_x_price_fraction",
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
  questions: jsonb("questions").notNull().$type<{ key: string; prompt: string; kind: "yes_no_notyet" | "stat_number" | "stat_text"; unit?: string }[]>(),
  readsFromProfile: boolean("reads_from_profile").notNull().default(false),
  benchmarkValue: real("benchmark_value"), // 0-1 fraction; null = no comparable stat
  benchmarkStatKey: text("benchmark_stat_key"), // which businessLevers.stats key the benchmark applies to
  formulaType: leverFormulaType("formula_type").notNull().default("none"),
  formulaParams: jsonb("formula_params").notNull().default({}).$type<Record<string, number>>(),
  effort: text("effort").notNull(), // "faible" | "moyen" | "eleve"
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true), // soft-disable without deleting
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

// --- Journal de bord (calendrier + to-do + projets) -------------------------
// Calendar auto-populates from improvement_events + the existing daily
// setting/closing tables — the only manual input on this whole page is the
// free-text daily note. No new metric-entry surface (CLAUDE.md's
// simplification rule): monthly_metrics/setting_kpi_entries/
// closing_kpi_entries stay canonical for numbers.

export const projectStatus = pgEnum("project_status", ["active", "done"]);

export type ProjectMilestone = { order: number; title: string; done: boolean; doneAt: string | null };

export const projects = pgTable("projects", {
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
}).enableRLS();

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
