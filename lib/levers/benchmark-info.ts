// Static reference data for the Optimisation cards (DiscoveryOpportunityCard)
// — a 1-sentence explanation of what the lever is, plus (where the source
// benchmarks support it) a 3-zone graduation band for LeverBenchmarkBar.
// Deliberately NOT stored in levers_catalog/DB: this is display copy, not an
// operational parameter — editing a sentence or a threshold here needs no
// re-seed, unlike formulaParams.rate/benchmarkValue in seed-levers-catalog.mjs
// (still the source of truth for the actual € calculations).
//
// badMax/okMax are the two zone boundaries (rouge→ambre at badMax,
// ambre→vert at okMax) — the same 3-tier language as getHealthTier
// elsewhere in the app, not a 4th color. excellentAt is just a marker line
// inside the green zone, matching the source doc's "excellent" tier without
// inventing a 4th color. All fractions are 0-1. Sourced from the
// Livestorm/ON24/Klaviyo/Omnisend/Unbounce/Magellan AI/MailerLite/Mailchimp/
// ReferralCandy/Survicate benchmark table (2026).
export type LeverBenchmarkInfo = {
  whatIsThis: string;
  centralLabel?: string;
  badMax?: number;
  okMax?: number;
  excellentAt?: number;
};

export const LEVER_BENCHMARK_INFO: Record<string, LeverBenchmarkInfo> = {
  lead_magnet: {
    whatIsThis: "Une ressource gratuite (PDF, vidéo, formation…) échangée contre l'email d'un visiteur sur une page dédiée.",
    centralLabel: "6–12 %",
    badMax: 0.05,
    okMax: 0.09,
    excellentAt: 0.15,
  },
  email_marketing: {
    whatIsThis: "Des emails envoyés régulièrement à ta liste pour vendre et fidéliser.",
    centralLabel: "35–43 % d'ouverture",
    badMax: 0.25,
    okMax: 0.35,
    excellentAt: 0.43,
  },
  newsletter: {
    whatIsThis: "Un email de contenu régulier envoyé à ta liste, distinct de tes séquences de vente automatisées.",
    centralLabel: "2–3 % de clic",
    badMax: 0.02,
    okMax: 0.03,
    excellentAt: 0.05,
  },
  seo_blog: {
    whatIsThis: "Du contenu organique (blog, SEO) qui attire des visiteurs sans publicité payante.",
    centralLabel: "2–5 % visiteur → lead",
    badMax: 0.02,
    okMax: 0.05,
    excellentAt: 0.1,
  },
  podcast: {
    whatIsThis: "Un podcast que tu animes toi-même pour construire une audience et générer des leads.",
    // Pas de benchmark chiffré : les seules données publiques robustes
    // (Magellan AI) mesurent des CAMPAGNES PUB dans des podcasts tiers, pas
    // un podcast propriétaire — pas de tiers inventés.
  },
  retargeting: {
    whatIsThis: "Des publicités qui reciblent les visiteurs qui n'ont pas encore acheté.",
    centralLabel: "0,7–1,2 % de clic",
    badMax: 0.005,
    okMax: 0.007,
    excellentAt: 0.012,
  },
  referral: {
    whatIsThis: "Un programme qui incite tes clients à recommander ton offre à leur entourage.",
    centralLabel: "3–5 % visite référée → achat",
    badMax: 0.02,
    okMax: 0.03,
    excellentAt: 0.08,
  },
  ads: {
    whatIsThis: "De la publicité payante (Meta, Google, TikTok, LinkedIn) pour générer des leads ou des ventes rapidement.",
    // Pas de bande unique : le coût par résultat benchmark dépend du canal
    // choisi (voir AD_CHANNEL_BENCHMARKS dans opportunities.ts) — comparé
    // directement dans l'explication du gain plutôt que sur cette barre.
  },
  webinar: {
    whatIsThis: "Un événement en ligne en direct pour présenter ton offre et vendre à la fin.",
    centralLabel: "45–60 % de présence live",
    badMax: 0.35,
    okMax: 0.5,
    excellentAt: 0.6,
  },
  order_bump: {
    whatIsThis: "Une offre complémentaire à petit prix proposée juste avant le paiement.",
    centralLabel: "10–30 % (estimation provisoire, faible fiabilité)",
    badMax: 0.1,
    okMax: 0.2,
    excellentAt: 0.3,
  },
  downsell: {
    whatIsThis: "Une alternative moins chère proposée quand un client refuse ton offre principale.",
    // Pas de benchmark public robuste (le document le dit explicitement) —
    // pas de tiers inventés, seulement l'explication.
  },
  garantie: {
    whatIsThis: "Un engagement formel (remboursement, résultat garanti…) qui réduit le risque perçu par le prospect.",
  },
  preuve_sociale_page: {
    whatIsThis: "Des témoignages clients affichés sur ta page de vente pour rassurer avant l'achat.",
  },
  upsell_ascension: {
    whatIsThis: "Une offre plus chère proposée juste après l'achat pour augmenter la valeur du client.",
    centralLabel: "2–12 % d'acceptation",
    badMax: 0.02,
    okMax: 0.06,
    excellentAt: 0.12,
  },
  onboarding_structure: {
    whatIsThis: "Un parcours structuré qui aide un nouveau client à démarrer et à réussir avec ton produit.",
  },
  collecte_temoignages_systematique: {
    whatIsThis: "Un process systématique pour demander un témoignage à chaque client satisfait.",
    centralLabel: "≈10 % demande → réponse",
    badMax: 0.05,
    okMax: 0.1,
    excellentAt: 0.2,
  },
  communaute_clients: {
    whatIsThis: "Un espace (Discord, groupe privé…) où tes clients échangent entre eux et avec toi.",
  },
  reactivation_anciens_clients: {
    whatIsThis: "Une relance ciblée de tes anciens clients inactifs pour les faire racheter.",
    centralLabel: "≈2,8 % de clic win-back",
    badMax: 0.015,
    okMax: 0.028,
    excellentAt: 0.04,
  },
  vsl: {
    whatIsThis: "Une vidéo de vente longue qui explique et vend ton offre avant l'appel ou l'achat.",
  },
  sequence_relance_non_acheteurs: {
    whatIsThis: "Une séquence automatique qui relance les prospects qui n'ont pas acheté après un appel ou une page de vente.",
  },
};
