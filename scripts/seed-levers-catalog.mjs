// One-off seed for the `levers_catalog` table (lib/levers/catalog.ts). Same
// pattern as scripts/seed-benchmarks.mjs: plain .mjs (no ts-node/tsx runner
// configured), run once via `node scripts/seed-levers-catalog.mjs` against
// .env.local, idempotent via full delete+reinsert (not an upsert).
//
// formulaType/formulaParams only set where the brief gave a concrete
// formula example (email_marketing, upsell_ascension) — every other lever
// is "none" ("Impact : à évaluer"), per the explicit "jamais un chiffre
// inventé" rule rather than guessing a formula the brief didn't specify.
//
// readsFromProfile levers (vsl, sequence_relance_non_acheteurs,
// upsell_ascension, onboarding_structure) get `questions: []` — resolved
// from business_profile instead, see lib/levers/catalog.ts's
// resolveFromBusinessProfile. order_bump and downsell are seeded as two
// separate rows (the brief's own "8/19" example implies 19 total levers,
// which only adds up if these are split rather than one combined lever).
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

const yesNo = (key, prompt) => ({ key, prompt, kind: "yes_no_notyet" });
const stat = (key, prompt, unit) => ({ key, prompt, kind: "stat_number", ...(unit ? { unit } : {}) });
const text = (key, prompt) => ({ key, prompt, kind: "stat_text" });

const LEVERS = [
  // --- ACQUISITION ---
  {
    leverKey: "lead_magnet",
    label: "Lead magnet",
    category: "acquisition",
    questions: [
      yesNo("hasLeadMagnet", "Tu proposes un lead magnet (PDF, formation gratuite…) ?"),
      text("type", "Quel type de lead magnet ?"),
      stat("optinRate", "Taux d'opt-in sur ta page dédiée, à peu près ?", "%"),
    ],
    benchmarkValue: 0.3,
    benchmarkStatKey: "optinRate",
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 1,
  },
  {
    leverKey: "email_marketing",
    label: "Email marketing",
    category: "acquisition",
    questions: [
      yesNo("hasEmailMarketing", "Tu envoies des emails à ta liste ?"),
      stat("listSize", "Taille de ta liste ?"),
      stat("frequencyPerWeek", "Fréquence d'envoi par semaine ?"),
      stat("openRate", "Taux d'ouverture, à peu près ?", "%"),
      stat("ctr", "Taux de clic, à peu près ?", "%"),
      stat("revenueAttributed", "CA attribué à l'emailing par mois, à peu près ?", "€"),
    ],
    benchmarkValue: 0.35,
    benchmarkStatKey: "openRate",
    formulaType: "leads_x_rate_x_closing_x_price",
    formulaParams: { rate: 0.025 },
    effort: "moyen",
    sortOrder: 2,
  },
  {
    leverKey: "newsletter",
    label: "Newsletter",
    category: "acquisition",
    questions: [yesNo("hasNewsletter", "Cadence régulière de newsletter (distincte des séquences) ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 3,
  },
  {
    leverKey: "seo_blog",
    label: "Blog / SEO",
    category: "acquisition",
    questions: [yesNo("hasSeoBlog", "Tu as un blog / du contenu SEO ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "eleve",
    sortOrder: 4,
  },
  {
    leverKey: "podcast",
    label: "Podcast",
    category: "acquisition",
    questions: [
      yesNo("hasPodcast", "Tu as un podcast ?"),
      stat("frequencyPerMonth", "Fréquence par mois ?"),
    ],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "eleve",
    sortOrder: 5,
  },
  {
    leverKey: "retargeting",
    label: "Retargeting",
    category: "acquisition",
    questions: [yesNo("hasRetargeting", "Tu fais du retargeting sur tes visiteurs/viewers ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 6,
  },
  {
    leverKey: "referral",
    label: "Parrainage",
    category: "acquisition",
    questions: [yesNo("hasReferral", "Tes clients peuvent-ils te recommander (parrainage) ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 7,
  },

  // --- VENTE ---
  {
    leverKey: "vsl",
    label: "VSL",
    category: "vente",
    questions: [],
    readsFromProfile: true,
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 1,
  },
  {
    leverKey: "webinar",
    label: "Webinaire / masterclass",
    category: "vente",
    questions: [
      yesNo("hasWebinar", "Tu fais des webinaires/masterclass de vente ?"),
      stat("frequencyPerMonth", "Fréquence par mois ?"),
      stat("inscrits", "Nombre d'inscrits en moyenne ?"),
      stat("presents", "Nombre de présents en moyenne ?"),
      stat("showUpRate", "Taux de présence, à peu près ?", "%"),
      stat("ventes", "Ventes générées en moyenne par session ?"),
    ],
    benchmarkValue: 0.4,
    benchmarkStatKey: "showUpRate",
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 2,
  },
  {
    leverKey: "sequence_relance_non_acheteurs",
    label: "Relance non-acheteurs",
    category: "vente",
    questions: [],
    readsFromProfile: true,
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 3,
  },
  {
    leverKey: "order_bump",
    label: "Order bump",
    category: "vente",
    questions: [yesNo("hasOrderBump", "Tu proposes une offre complémentaire au checkout ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 4,
  },
  {
    leverKey: "downsell",
    label: "Downsell",
    category: "vente",
    questions: [yesNo("hasDownsell", "Une alternative moins chère en cas de refus ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 5,
  },
  {
    leverKey: "garantie",
    label: "Garantie",
    category: "vente",
    questions: [yesNo("hasGarantie", "Ton offre a-t-elle une garantie formulée ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 6,
  },
  {
    leverKey: "preuve_sociale_page",
    label: "Preuve sociale (page de vente)",
    category: "vente",
    questions: [yesNo("hasPreuveSociale", "Témoignages sur ta page de vente ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 7,
  },

  // --- DÉLIVRABILITÉ ---
  {
    leverKey: "upsell_ascension",
    label: "Upsell / ascension",
    category: "delivrabilite",
    questions: [],
    readsFromProfile: true,
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "clients_x_takerate_x_price_fraction",
    formulaParams: { takeRate: 0.2, priceFraction: 0.3 },
    effort: "moyen",
    sortOrder: 1,
  },
  {
    leverKey: "onboarding_structure",
    label: "Structure d'onboarding",
    category: "delivrabilite",
    questions: [],
    readsFromProfile: true,
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 2,
  },
  {
    leverKey: "collecte_temoignages_systematique",
    label: "Collecte de témoignages",
    category: "delivrabilite",
    questions: [yesNo("hasCollecteTemoignages", "Tu as un process pour demander les témoignages ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 3,
  },
  {
    leverKey: "communaute_clients",
    label: "Communauté clients",
    category: "delivrabilite",
    questions: [yesNo("hasCommunaute", "Tes clients ont un espace communautaire ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 4,
  },
  {
    leverKey: "reactivation_anciens_clients",
    label: "Réactivation d'anciens clients",
    category: "delivrabilite",
    questions: [yesNo("hasReactivation", "Tu recontactes tes anciens clients ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 5,
  },
];

await sql`delete from levers_catalog`;

for (const lever of LEVERS) {
  await sql`
    insert into levers_catalog
      (lever_key, label, category, questions, reads_from_profile, benchmark_value, benchmark_stat_key, formula_type, formula_params, effort, sort_order)
    values (
      ${lever.leverKey}, ${lever.label}, ${lever.category}, ${sql.json(lever.questions)},
      ${lever.readsFromProfile ?? false}, ${lever.benchmarkValue}, ${lever.benchmarkStatKey},
      ${lever.formulaType}, ${sql.json(lever.formulaParams)}, ${lever.effort}, ${lever.sortOrder}
    )
  `;
}

const rows = await sql`select lever_key, category, sort_order from levers_catalog order by category, sort_order`;
console.log(`Seeded ${rows.length} levers`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
