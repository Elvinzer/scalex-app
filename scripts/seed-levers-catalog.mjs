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
//
// explanation/estTimeLabel are only curated for the "Démarrer un levier"
// chantier's pilot set of 6 levers (lead_magnet, email_marketing, ads, vsl,
// webinar, upsell_ascension) — every other lever intentionally keeps
// explanation: null, which /demarrer/[leverKey] renders as "section
// masquée", not a placeholder. Extend this list to add more levers to the
// guide without any code change.
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
const select = (key, prompt, options) => ({ key, prompt, kind: "select", options });

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
    explanation:
      "Un lead magnet, c'est une ressource gratuite (PDF, mini-formation, checklist, audit...) que tu échanges contre l'email d'un prospect. C'est la porte d'entrée de ton funnel : quelqu'un qui télécharge ton lead magnet devient un contact que tu peux relancer, nourrir et convertir — au lieu de perdre un visiteur qui repart sans laisser de trace.\n\nPour un coach, ça rapporte parce que ça transforme du trafic froid (réseaux sociaux, SEO, pub) en liste email que tu contrôles. Un bon lead magnet répond à UNE douleur précise de ton avatar, se consomme en moins de 15 minutes, et pointe naturellement vers ton offre.\n\nConcrètement, ça ressemble à : une checklist \"5 erreurs qui bloquent tes clients\", ou un audit express de leur situation actuelle — quelque chose qui donne un premier résultat rapide et donne envie d'aller plus loin avec toi.",
    estTimeLabel: "2-4h",
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
    explanation:
      "L'emailing, c'est la relation continue avec ta liste : une séquence de bienvenue quand quelqu'un s'inscrit, puis des envois réguliers qui informent, engagent et vendent. C'est le canal le moins cher et le plus rentable une fois en place, parce que tu ne repayes jamais pour reparler à quelqu'un qui t'a déjà donné son email.\n\nPour un coach, ça rapporte parce que la majorité des gens n'achètent pas au premier contact — l'email est ce qui les garde chauds jusqu'à ce qu'ils soient prêts. Une séquence de bienvenue bien faite peut à elle seule générer des ventes en pilote automatique.\n\nConcrètement : 3 à 5 emails automatiques envoyés dans les jours suivant l'inscription (qui es-tu, quelle transformation tu proposes, un cas client, une offre), puis des envois hebdomadaires ou bihebdomadaires avec du contenu utile et des rappels de ton offre.",
    estTimeLabel: "3-5h pour la séquence de bienvenue",
  },
  {
    leverKey: "newsletter",
    label: "Newsletter",
    category: "acquisition",
    questions: [
      yesNo("hasNewsletter", "Cadence régulière de newsletter (distincte des séquences) ?"),
      stat("openRate", "Taux d'ouverture, à peu près ?", "%"),
      stat("ctr", "Taux de clic, à peu près ?", "%"),
    ],
    // Benchmark sur le clic (pas l'ouverture) — le clic reflète mieux
    // l'intérêt réel de l'audience pour le contenu (voir
    // lib/levers/benchmark-info.ts).
    benchmarkValue: 0.03,
    benchmarkStatKey: "ctr",
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
  {
    leverKey: "ads",
    label: "Publicité (Ads)",
    category: "acquisition",
    questions: [
      yesNo("hasAds", "Tu fais de la publicité payante (Meta, Google, TikTok, LinkedIn) ?"),
      // Only the 5 channels present in AD_CHANNEL_BENCHMARKS (lib/levers/opportunities.ts)
      // get a cost-per-result comparison; the others fall back to the generic
      // effort-based estimate (no invented CPA). Prompt says "publicitaire" so
      // the question stays self-explanatory once the yes/no context is gone.
      select("channel", "Canal publicitaire principal", [
        "Meta — génération de leads",
        "Meta — ecommerce",
        "Meta — trafic / notoriété",
        "Google Search",
        "YouTube Ads",
        "TikTok — génération de leads",
        "TikTok — ecommerce",
        "LinkedIn — B2B",
      ]),
      stat("monthlySpend", "Budget pub mensuel, à peu près ?", "€"),
      stat("monthlyResults", "Leads ou clients générés par mois, à peu près ?"),
    ],
    // Pas de comparaison générique "leads_x_rate..." — le coût par résultat
    // benchmark dépend du canal choisi, calculé à part (voir
    // AD_CHANNEL_BENCHMARKS dans lib/levers/opportunities.ts). Le cas ABSENT
    // (pas encore de canal choisi) utilise sa propre formule budget-de-test,
    // voir estimateAdsAbsent — testBudgetPerDayEur/defaultCpaEur sont des
    // hypothèses prudentes, pas le vrai coût par lead d'un canal réel (inconnu
    // tant qu'aucune campagne n'existe). revenueThresholdEur/
    // dampeningBelowThreshold reprennent le même seuil que la règle
    // priority_rules "lever_revenue_gate" (3000€) — l'impact lui-même est
    // amorti en dessous, pas seulement son tri.
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "ads_test_budget_x_closing_x_price",
    formulaParams: {
      testBudgetPerDayEur: 10,
      defaultCpaEur: 30,
      revenueThresholdEur: 3000,
      dampeningBelowThreshold: 0.3,
      rangeVariance: 0.3,
    },
    effort: "moyen",
    sortOrder: 8,
    explanation:
      "La publicité payante, c'est acheter de la visibilité garantie sur Meta, Google, TikTok ou LinkedIn, au lieu de dépendre uniquement de l'algorithme organique. C'est un levier de VOLUME : une fois que ton funnel convertit bien, chaque euro dépensé devient un investissement prévisible plutôt qu'une dépense.\n\nPour un coach, ça rapporte parce que ça découple ta croissance du temps que tu passes à créer du contenu — tu peux scaler ton acquisition sans scaler tes heures. Mais c'est aussi le levier le plus risqué si ton closing n'est pas encore solide : payer pour des leads que tu ne sais pas convertir, c'est brûler du cash.\n\nConcrètement : un budget test modeste (quelques dizaines d'euros par jour) sur UN canal, une offre claire en bout de funnel, et un suivi serré du coût par lead pour savoir vite si ça marche ou s'il faut couper.",
    estTimeLabel: "1-2 semaines pour la première campagne",
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
    // Absent-case formula: uplift on top of the CURRENT booking volume
    // (settingTotals.callsBooked) — see estimateVslAbsent in
    // lib/levers/opportunities.ts. upliftMin/upliftMax IS the displayed
    // range (a VSL's real effect is inherently uncertain before it exists),
    // no separate variance param needed like ads.
    formulaType: "traffic_uplift_x_price",
    formulaParams: { upliftMin: 0.2, upliftMax: 0.4 },
    effort: "moyen",
    sortOrder: 1,
    explanation:
      "Une VSL (Video Sales Letter), c'est une vidéo de vente structurée — généralement 10 à 30 minutes — qui présente ton offre, traite les objections principales et amène à l'action, à la place (ou en complément) d'un appel de vente humain.\n\nPour un coach, ça rapporte parce qu'elle travaille 24h/24 sans que tu sois derrière : elle peut pré-qualifier tes prospects avant même l'appel, ce qui augmente le taux de prise de rendez-vous ET la qualité des gens qui arrivent en appel (déjà convaincus, moins d'objections à traiter en live).\n\nConcrètement : une histoire (le problème que tu as toi-même vécu ou observé), la méthode/mécanisme unique que tu proposes, une preuve sociale, et un appel à l'action clair vers la prise de rendez-vous ou l'achat direct.",
    estTimeLabel: "1-2 semaines (script + tournage)",
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
    // "Bon niveau" de présence live (50-60%) — sourced benchmark table,
    // see lib/levers/benchmark-info.ts. Previously 0.4, a rough guess.
    benchmarkValue: 0.5,
    benchmarkStatKey: "showUpRate",
    formulaType: "leads_x_rate_x_closing_x_price",
    // Clic CTA central (≈9%) from the sourced benchmark table — previously
    // 0.06, a rough guess undersellling this lever.
    formulaParams: { rate: 0.09 },
    effort: "moyen",
    sortOrder: 2,
    explanation:
      "Un webinaire, c'est une session live (ou semi-live) où tu enseignes quelque chose de concret à ton audience pendant 45-90 minutes, puis tu présentes ton offre à la fin. C'est un format qui combine contenu de valeur et vente en une seule session.\n\nPour un coach, ça rapporte parce que le format live crée un engagement et une urgence qu'un email ou un post ne peuvent pas reproduire — les gens qui restent jusqu'au bout sont déjà investis, et le taux de conversion en vente y est généralement plus élevé qu'ailleurs dans le funnel.\n\nConcrètement : une promesse de résultat précise pour l'inscription, un enseignement qui donne un vrai résultat (pas juste une accroche), puis une offre présentée avec un deadline ou un bonus limité dans le temps pour créer une décision.",
    estTimeLabel: "1 semaine (préparation + présentation)",
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
    explanation:
      "L'upsell, c'est proposer une offre complémentaire — plus complète, plus accompagnée, ou plus avancée — à quelqu'un qui vient déjà d'acheter (ou qui est déjà client). C'est le levier au meilleur rapport effort/gain : tu ne dépenses rien en acquisition, tu vends à quelqu'un qui te fait déjà confiance.\n\nPour un coach, ça rapporte parce qu'augmenter le panier moyen de tes clients existants coûte beaucoup moins cher que d'aller chercher un nouveau client — et le moment juste après un achat (ou une victoire client) est celui où la confiance est la plus haute.\n\nConcrètement : une offre d'ascension claire (un programme VIP, un accompagnement plus poussé, un module complémentaire) proposée au bon moment — juste après la vente principale, ou après un premier résultat obtenu.",
    estTimeLabel: "3-5h pour définir l'offre et le script",
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
      (lever_key, label, category, questions, reads_from_profile, benchmark_value, benchmark_stat_key, formula_type, formula_params, effort, sort_order, explanation, est_time_label)
    values (
      ${lever.leverKey}, ${lever.label}, ${lever.category}, ${sql.json(lever.questions)},
      ${lever.readsFromProfile ?? false}, ${lever.benchmarkValue}, ${lever.benchmarkStatKey},
      ${lever.formulaType}, ${sql.json(lever.formulaParams)}, ${lever.effort}, ${lever.sortOrder},
      ${lever.explanation ?? null}, ${lever.estTimeLabel ?? null}
    )
  `;
}

const rows = await sql`select lever_key, category, sort_order from levers_catalog order by category, sort_order`;
console.log(`Seeded ${rows.length} levers`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
