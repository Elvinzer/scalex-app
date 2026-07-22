import { Search, Target, Zap, type LucideIcon } from "lucide-react";

// All copy/data for the marketing homepage lives here — every section
// component reads from this file instead of hardcoding strings, so the
// numbers (visual examples, not real product metrics yet) and testimonials
// (placeholder content, clearly swappable) can be updated in one place.

export const NAV_LINKS: { label: string; href: string }[] = [
  { label: "Produit", href: "#produit" },
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Tarifs", href: "#tarifs" },
  { label: "Avis", href: "#avis" },
];

export const BENEFITS: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Détecte les pertes",
    description: "Identifie précisément où ton business perd de l'argent chaque mois.",
    icon: Search,
  },
  {
    title: "Priorise les actions",
    description: "Concentre-toi sur les leviers qui auront le plus d'impact sur ton chiffre d'affaires.",
    icon: Target,
  },
  {
    title: "Passe à l'exécution",
    description: "Reçois un plan clair pour corriger les fuites et mesurer les résultats.",
    icon: Zap,
  },
];

// Visual examples — structured as data specifically so these can be swapped
// for real aggregate numbers later without touching ResultsStrip's markup.
export const RESULT_METRICS: { value: string; label: string }[] = [
  { value: "+28 %", label: "de chiffre d'affaires en moyenne" },
  { value: "16 h", label: "économisées par semaine" },
  { value: "96 320 €", label: "de CA récupérable détecté" },
];

export const HOW_IT_WORKS_STEPS: { n: string; title: string; description: string }[] = [
  {
    n: "01",
    title: "Diagnostiquer",
    description: "Scale X analyse les données de ton business et repère les fuites.",
  },
  {
    n: "02",
    title: "Prioriser",
    description: "Les opportunités sont classées selon leur impact et leur urgence.",
  },
  {
    n: "03",
    title: "Corriger",
    description: "Tu exécutes un plan clair et mesures les résultats obtenus.",
  },
];

// Placeholder testimonials — no real client names/companies exist yet.
// Swap this array for real quotes as they come in.
export const TESTIMONIALS: { quote: string; name: string; role: string }[] = [
  {
    quote: "Scale X nous a permis d'identifier des pertes que nous ne voyions pas.",
    name: "Antoine D.",
    role: "Fondateur, Agence Nova",
  },
  {
    quote: "Les recommandations sont claires, prioritaires et directement actionnables.",
    name: "Sophie L.",
    role: "CEO, Studio Bloom",
  },
  {
    quote: "Nous savons enfin quoi corriger en premier chaque semaine.",
    name: "Marc T.",
    role: "Fondateur, Peak Digital",
  },
];

export const PRICING_TIERS: {
  key: string;
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}[] = [
  {
    key: "starter",
    name: "Starter",
    price: "49",
    tagline: "Pour valider où tu perds de l'argent.",
    features: ["Diagnostic Stripe complet", "1 catégorie active", "Insights hebdomadaires", "Support email"],
  },
  {
    key: "growth",
    name: "Growth",
    price: "149",
    tagline: "Pour corriger activement chaque mois.",
    features: ["Toutes les catégories", "Copilote IA illimité", "Alertes en temps réel", "Support prioritaire"],
    highlight: true,
  },
  {
    key: "scale",
    name: "Scale",
    price: "399",
    tagline: "Pour les équipes qui délèguent.",
    features: [
      "Tout Growth inclus",
      "Intégrations Ads (Meta, TikTok)",
      "Accès prioritaire aux features",
      "Account manager dédié",
    ],
  },
];

// Hero-side mockup: loss breakdown donut + top losses list.
export const LOSS_BREAKDOWN: { label: string; percent: number }[] = [
  { label: "Acquisition", percent: 40 },
  { label: "Conversion", percent: 25 },
  { label: "Funnel", percent: 20 },
  { label: "Autres", percent: 15 },
];

export const TOP_LOSSES: { label: string; value: string; severity: "Élevé" | "Moyen" }[] = [
  { label: "Campagnes sous-performantes", value: "32 460 €", severity: "Élevé" },
  { label: "Fuites au checkout", value: "24 890 €", severity: "Élevé" },
  { label: "Leads non qualifiés", value: "18 220 €", severity: "Moyen" },
];

// ProductOverview's own mockup — deliberately different cards from the hero
// (performance trend + actions in progress) per the brief's "don't repeat
// the same cards as the hero" rule.
export const PERFORMANCE_TREND: { label: string; value: number }[] = [
  { label: "1 mai", value: 52000 },
  { label: "8 mai", value: 71000 },
  { label: "15 mai", value: 64000 },
  { label: "22 mai", value: 128540 },
  { label: "29 mai", value: 96000 },
];

export const PRIORITY_ACTIONS: { label: string; impact: string; severity: "Élevé" | "Moyen" }[] = [
  { label: "Optimiser campagnes Meta", impact: "32 460 €", severity: "Élevé" },
  { label: "Réduire abandon panier", impact: "24 890 €", severity: "Élevé" },
  { label: "Améliorer qualification leads", impact: "18 220 €", severity: "Moyen" },
];
