// One-off seed for the `priority_rules` table (lib/diagnostic/priority-rules.ts).
// Same pattern as scripts/seed-levers-catalog.mjs: plain .mjs, run once via
// `node scripts/seed-priority-rules.mjs` against .env.local, idempotent via
// full delete+reinsert (not an upsert).
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

const RULES = [
  {
    condition: "lever_revenue_gate",
    params: { leverKey: "ads", revenueThresholdEur: 3000 },
    factor: 0.15,
    reasonTemplate: "Ton CA mensuel actuel (≈{{monthlyRevenueEur}}€) ne justifie pas encore la pub, on sécurise l'organique d'abord.",
  },
  {
    condition: "lever_requires_main_offer",
    params: { leverKey: "upsell_ascension" },
    factor: 0.2,
    reasonTemplate: "Ton offre principale doit être carrée avant d'empiler un upsell.",
  },
  {
    condition: "metric_near_benchmark",
    params: { gapThresholdFraction: 0.15 },
    factor: 0.6,
    reasonTemplate: "Ton taux ({{currentPercent}}%) est déjà proche du benchmark ({{benchmarkPercent}}%) — d'autres points paient plus vite.",
  },
  {
    condition: "top_funnel_when_closing_leaks",
    params: { closingGapThresholdFraction: 0.3 },
    factor: 0.5,
    reasonTemplate: "Inutile d'amener plus de gens tant que ton closing ({{closingCurrentPercent}}% vs {{closingBenchmarkPercent}}% de benchmark) perd la moitié des appels.",
  },
  {
    condition: "quick_win_low_effort",
    params: { minGainEur: 500 },
    factor: 1.3,
    reasonTemplate: "Effort {{effort}} pour ≈{{gainEur}}€/mois : un quick win pour prendre de l'élan.",
  },
];

await sql`delete from priority_rules`;

for (const rule of RULES) {
  await sql`
    insert into priority_rules
      (condition, params, factor, reason_template)
    values (
      ${rule.condition}, ${sql.json(rule.params)}, ${rule.factor}, ${rule.reasonTemplate}
    )
  `;
}

const rows = await sql`select condition, factor from priority_rules order by condition`;
console.log(`Seeded ${rows.length} priority rules`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
