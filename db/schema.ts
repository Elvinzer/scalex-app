import {
  date,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
  // Denormalized copy of stripe_connections.stripe_account_id for the active
  // connection, kept in sync on connect/disconnect — avoids a join to check
  // "is this user connected to Stripe". stripe_connections stays the source
  // of truth (token, connected_at).
  stripeConnectId: text("stripe_connect_id"),
  sector: prospectionSector("sector"),
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

// One AI-generated insight per (user, stage) — overwritten on regeneration,
// not versioned. keySource/inputTokens/outputTokens exist so the client can
// see their own consumption and so Scale X can track exposure on the shared
// fallback key (see lib/agent/quota.ts), per CLAUDE.md's BYOK logging rule.
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
  },
  (table) => [
    uniqueIndex("funnel_stage_insights_user_stage_idx").on(table.userId, table.stage),
  ]
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
