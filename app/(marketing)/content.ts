import { Search, Target, Zap, type LucideIcon } from "lucide-react";

export const NAV_LINKS = [
  { labelKey: "nav.product", href: "/#produit" },
  { labelKey: "nav.pricing", href: "/#tarifs" },
  { labelKey: "nav.resources", href: "/ressources/coach-business-scaling" },
] as const;

export const BENEFITS: { key: "bottleneck" | "priority" | "execution"; icon: LucideIcon }[] = [
  { key: "bottleneck", icon: Search },
  { key: "priority", icon: Target },
  { key: "execution", icon: Zap },
];

export const RESULT_METRICS = [
  { valueKey: "stats.one.value", labelKey: "stats.one.label" },
  { valueKey: "stats.range.value", labelKey: "stats.range.label" },
  { valueKey: "stats.weekly.value", labelKey: "stats.weekly.label" },
] as const;

export const HOW_IT_WORKS_STEPS = [
  { n: "01", key: "measure" },
  { n: "02", key: "diagnose" },
  { n: "03", key: "execute" },
] as const;

export const USE_CASES = [
  { key: "coach" },
  { key: "infobusiness" },
  { key: "smallTeam" },
] as const;

export const PRICING_TIERS = [
  { key: "solo", monthlyPrice: 79, annualPrice: 790, highlight: false },
  { key: "team", monthlyPrice: 199, annualPrice: 1990, highlight: true },
] as const;

export const LOSS_BREAKDOWN = [
  { key: "acquisition", percent: 40 },
  { key: "conversion", percent: 25 },
  { key: "delivery", percent: 20 },
  { key: "other", percent: 15 },
] as const;

export const TOP_LOSSES = [
  { key: "meta", valueKey: "dashboard.valueMeta", severity: "high" as const },
  { key: "checkout", valueKey: "dashboard.valueCheckout", severity: "high" as const },
  { key: "qualification", valueKey: "dashboard.valueQualification", severity: "medium" as const },
] as const;

export const PERFORMANCE_TREND = [
  { labelKey: "product.chartDate1", value: 52_000 },
  { labelKey: "product.chartDate2", value: 71_000 },
  { labelKey: "product.chartDate3", value: 64_000 },
  { labelKey: "product.chartDate4", value: 128_540 },
  { labelKey: "product.chartDate5", value: 96_000 },
] as const;

export const PRIORITY_ACTIONS = [
  { labelKey: "product.action1", impactKey: "dashboard.valueMeta", severity: "high" as const },
  { labelKey: "product.action2", impactKey: "dashboard.valueCheckout", severity: "high" as const },
  { labelKey: "product.action3", impactKey: "dashboard.valueQualification", severity: "medium" as const },
] as const;

export const FAQ_KEYS = ["whatIs", "whoFor", "data", "diagnostic", "trial", "replace"] as const;
export const RESOURCE_FAQ_KEYS = ["faq1", "faq2", "faq3"] as const;

export type MarketingBenefitKey = (typeof BENEFITS)[number]["key"];
export type MarketingStepKey = (typeof HOW_IT_WORKS_STEPS)[number]["key"];
export type MarketingUseCaseKey = (typeof USE_CASES)[number]["key"];
