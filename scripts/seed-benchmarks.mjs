// One-off seed for the `benchmarks` table (lib/diagnostic/benchmarks.ts).
// Plain .mjs (no ts-node/tsx runner configured in this project) run once via
// `node scripts/seed-benchmarks.mjs` against .env.local. Values: the global
// row matches the spec's stated defaults; sector overrides reuse the
// existing SECTOR_BENCHMARKS' `.bon` values from lib/benchmarks.ts (the
// closest existing "good" reference point) — proposalRate has no prior
// sector-specific data anywhere, so only a global row is seeded for it.
import postgres from "postgres";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sql = postgres(env.DATABASE_URL, { prepare: false });

const GLOBAL = {
  responseRate: 0.3,
  proposalRate: 0.25,
  bookingRate: 0.6,
  showUpRate: 0.7,
  closingRate: 0.3,
  // Content mini-funnel (views -> clicks -> leads) — global only, no
  // sector-specific data source exists yet.
  content_click_rate: 0.015,
  content_lead_rate: 0.3,
  // Content -> pipeline mini-funnel (views -> RDV bookés -> RDV closés,
  // lib/diagnostic/content-metrics.ts) — first-pass calibration, no real
  // cross-user data source exists yet, adjustable here without a redeploy.
  // content_booking_rate is deliberately far below content_click_rate:
  // booking a call is a much bigger commitment than a click. content_close_rate
  // reuses the same 0.3 as the sales cascade's own closingRate below — no
  // reason a content-sourced RDV should structurally close differently
  // once it's actually booked.
  content_booking_rate: 0.005,
  content_close_rate: 0.3,
  // Pipeline Kanban (leads travaillés -> closés, lib/diagnostic/pipeline-metrics.ts)
  // — a wider funnel than closingRate (which starts from calls attended,
  // not raw leads), so deliberately lower. No real cross-user data exists
  // yet — a placeholder starting point, adjustable in the benchmarks table
  // without a redeploy.
  pipeline_closing_rate: 0.15,
};

const SECTOR_OVERRIDES = {
  coaching_b2b_high_ticket: { responseRate: 0.45, bookingRate: 0.4, showUpRate: 0.75, closingRate: 0.45, pipeline_closing_rate: 0.2 },
  low_ticket_infoproduct: { responseRate: 0.55, bookingRate: 0.15, pipeline_closing_rate: 0.1 },
  ecommerce_dtc: { responseRate: 0.35, pipeline_closing_rate: 0.12 },
  real_estate_finance: { responseRate: 0.45, bookingRate: 0.3, showUpRate: 0.85, closingRate: 0.5, pipeline_closing_rate: 0.22 },
};

await sql`delete from benchmarks`;

for (const [metricKey, value] of Object.entries(GLOBAL)) {
  await sql`insert into benchmarks (sector, metric_key, value) values (null, ${metricKey}, ${value})`;
}

for (const [sector, overrides] of Object.entries(SECTOR_OVERRIDES)) {
  for (const [metricKey, value] of Object.entries(overrides)) {
    await sql`insert into benchmarks (sector, metric_key, value) values (${sector}, ${metricKey}, ${value})`;
  }
}

const rows = await sql`select sector, metric_key, value from benchmarks order by sector nulls first, metric_key`;
console.log(`Seeded ${rows.length} rows`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
