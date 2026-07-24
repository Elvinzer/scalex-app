// One-off seed for the `lever_starter_plans` table (lib/levers/starter-plan.ts).
// Same pattern as scripts/seed-levers-catalog.mjs: plain .mjs, run once via
// `node scripts/seed-lever-starter-plans.mjs` against .env.local, idempotent
// via full delete+reinsert (not an upsert). Content is DB-editable
// afterwards without a redeploy — this is just the initial seed.
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

const step = (order, title) => ({ order, title });

const PLANS = [
  {
    leverKey: "email_marketing",
    steps: [
      step(1, "Choisir un outil d'emailing"),
      step(2, "Définir ta séquence de bienvenue (Falco peut la rédiger avec toi)"),
      step(3, "Faire ton premier envoi"),
      step(4, "Saisir tes premiers chiffres (envois, ouvertures, clics)"),
    ],
  },
  {
    leverKey: "ads",
    steps: [
      step(1, "Définir l'offre et le budget test"),
      step(2, "Créer ta première campagne"),
      step(3, "Saisir tes premiers chiffres"),
    ],
  },
  {
    leverKey: "upsell_ascension",
    steps: [
      step(1, "Choisir l'offre support (celle que tu vends déjà)"),
      step(2, "Définir l'offre complémentaire dans Produits"),
      step(3, "Préparer ton script de proposition (Falco peut le rédiger avec toi)"),
      step(4, "Faire ta première vente avec upsell"),
    ],
  },
];

await sql`delete from lever_starter_plans`;

for (const plan of PLANS) {
  await sql`
    insert into lever_starter_plans (lever_key, steps)
    values (${plan.leverKey}, ${sql.json(plan.steps)})
  `;
}

const rows = await sql`select lever_key from lever_starter_plans order by lever_key`;
console.log(`Seeded ${rows.length} starter plans`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
