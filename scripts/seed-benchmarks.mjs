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
};

const SECTOR_OVERRIDES = {
  coaching_b2b_high_ticket: { responseRate: 0.45, bookingRate: 0.4, showUpRate: 0.75, closingRate: 0.45 },
  low_ticket_infoproduct: { responseRate: 0.55, bookingRate: 0.15 },
  ecommerce_dtc: { responseRate: 0.35 },
  real_estate_finance: { responseRate: 0.45, bookingRate: 0.3, showUpRate: 0.85, closingRate: 0.5 },
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
