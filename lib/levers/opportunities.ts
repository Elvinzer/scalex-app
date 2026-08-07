import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { businessLevers } from "@/db/schema";
import type { ClosingTotals } from "@/lib/closing/metrics";
import { formatEur } from "@/lib/currency";
import { inRange } from "@/lib/dashboard/metrics";
import { buildRates, resolveDealPrice } from "@/lib/diagnostic/cascade";
import type { MonthWindow } from "@/lib/diagnostic/completed-months";
import { getSales } from "@/lib/sales/queries";
import { scoreAgainstBenchmark } from "@/lib/scoring";
import type { FunnelTotals } from "@/lib/setting/funnel";
import type { BusinessProfileData } from "@/lib/business/types";
import { getLeversCatalog, resolveFromBusinessProfile, type LeverCatalogEntry } from "./catalog";

// email_marketing's own catalog row only checks openRate (its
// benchmarkStatKey) — CTR has no dedicated catalog column (levers_catalog
// is one benchmarkStatKey per row), so it's special-cased here exactly
// like "ads" below. 2.5% mirrors newsletter's own seeded ctr benchmark
// (the closest existing reference point for an email click-through rate,
// there being no benchmarks row of its own for this specific stat) —
// a calibration, adjustable in the same benchmarks table if needed.
const EMAIL_CTR_BENCHMARK = 0.025;

// Same 20% reference already shown in Mon business — reused
// here rather than a second hardcoded number.
const UPSELL_TAKE_RATE_BENCHMARK = 0.2;
// Below this many sales in the period, a take-rate is too noisy to advise
// on (5 sales flipping one upsell swings the rate by 20 points) — /ventes/
// upsell itself has no such gate today, so this is a new, deliberately
// conservative floor for this specific advisory context, not a regression.
const UPSELL_MIN_SALES = 5;

export type LeverOpportunity = {
  leverKey: string;
  label: string;
  category: LeverCatalogEntry["category"];
  effort: LeverCatalogEntry["effort"];
  impactAmountEur: number | null; // null = "Impact : à évaluer"
  // Display-only range for higher-uncertainty absent-case formulas (ads,
  // VSL) — impactAmountEur is always the range's midpoint and stays the
  // sole number scoreCandidates() sorts/scores on; the UI shows the range
  // instead of the point estimate whenever this is present.
  impactRangeEur?: { min: number; max: number } | null;
  impactExplanation: string;
  // "Pourquoi ce levier rapporte" — only set for ads/vsl/upsell_ascension
  // (see LEVER_CONTEXT_SENTENCE), null for every other lever.
  contextSentence?: string | null;
  // Feasibility caution shown directly on the card (e.g. ads below the
  // revenue threshold) — distinct from priority_rules' ranking-only "why",
  // which never reaches this card today.
  warning?: string | null;
};

export type LeverWatchItem = {
  leverKey: string;
  label: string;
  category: LeverCatalogEntry["category"];
  statValue: number;
  benchmarkValue: number;
  score: number; // 0-100, same tier semantics as getHealthTier — NOT a cascade MetricKey score
  impactAmountEur: number | null; // null = "Impact : à évaluer"
  impactExplanation: string;
  // Disambiguates a SECOND stat check on the same leverKey (e.g. email_marketing's
  // CTR alongside its openRate) — both entries share the same leverKey/agent
  // (there's only one email thread to open), but need distinct list identity
  // and their own advice template. Undefined = the lever's primary/only stat.
  statKey?: string;
};

// Which of the lever's own answered `stats` fields represents its real
// audience/reach size — used instead of the generic settingTotals.newSubscribers
// whenever the user has actually entered it for that specific lever (their
// email list size, their average webinar registrants...). Only levers with a
// formula-relevant audience concept need an entry here.
const LEVER_AUDIENCE_STAT_KEY: Record<string, string> = {
  email_marketing: "listSize",
  webinar: "inscrits",
};

// Cost-per-result benchmark by ad channel (Meta/Google/TikTok/LinkedIn,
// 2026 benchmark table) — treated as an approximate €-equivalent reference,
// not FX-converted from the source $/£ figures (same order-of-magnitude
// approximation as every other benchmark in this file). isEcommerce: true
// means the benchmark cost is already "per client" (no closing rate to
// apply); false means "per lead" (closing rate applies, same as every other
// leads_x_rate_x_closing_x_price lever).
const AD_CHANNEL_BENCHMARKS: Record<string, { cpa: number; isEcommerce: boolean }> = {
  "Meta — génération de leads": { cpa: 27.66, isEcommerce: false },
  "Meta — ecommerce": { cpa: 38, isEcommerce: true },
  "Google Search": { cpa: 66.69, isEcommerce: false },
  "TikTok — ecommerce": { cpa: 32.74, isEcommerce: true },
  "LinkedIn — B2B": { cpa: 45.49, isEcommerce: false },
};

// "Pourquoi ce levier rapporte" — narrative copy, not a formula (same
// precedent as LEVER_BENCHMARK_INFO's whatIsThis: fixed TS text, not a DB
// row). Scoped to the 3 levers this refined-impact chantier targets — the
// other ~16 catalog levers simply get no contextSentence (null).
const LEVER_CONTEXT_SENTENCE: Partial<Record<string, string>> = {
  ads: "La pub est un levier de volume : une fois ton closing solide, chaque euro dépensé devient prévisible.",
  vsl: "Une VSL travaille 24/7 sans coût marginal, en amont de l'appel.",
  upsell_ascension: "L'upsell est ton meilleur rapport effort/gain : tes clients existants, zéro acquisition en plus.",
};

function round(value: number): number {
  return Math.round(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// "Ads" doesn't fit the generic leads_x_rate_x_closing_x_price shape (its
// benchmark is a cost-per-result that depends on which channel the user
// picked, not a single conversion rate) — special-cased here by leverKey,
// same pattern as resolveFromBusinessProfile in catalog.ts. Only meaningful
// once the lever is active with real spend/results data; an absent "ads"
// lever falls back to the generic fallbackEstimate like every other lever.
// Returns null when there isn't enough data to say anything yet.
function estimateAdsEfficiency(
  stats: Record<string, number | string>,
  {
    settingTotals,
    closingTotals,
    businessProfile,
    cashContractedTotal,
    periodMonths,
  }: {
    settingTotals: FunnelTotals;
    closingTotals: ClosingTotals;
    businessProfile: BusinessProfileData;
    cashContractedTotal: number;
    periodMonths: number;
  }
): { efficiencyRatio: number; amountEur: number | null; explanation: string } | null {
  const channel = typeof stats.channel === "string" ? stats.channel : null;
  const benchmark = channel ? AD_CHANNEL_BENCHMARKS[channel] : undefined;
  const monthlySpend = typeof stats.monthlySpend === "number" ? stats.monthlySpend : null;
  const monthlyResults = typeof stats.monthlyResults === "number" ? stats.monthlyResults : null;
  if (!benchmark || !monthlySpend || !monthlyResults || monthlySpend <= 0 || monthlyResults <= 0) return null;

  // Budget guideline shown as context only, never folded into the gain
  // calculation below — a healthy ad-spend-to-revenue ratio, not a target
  // cost-per-result.
  const monthlyRevenue = cashContractedTotal / periodMonths;
  const targetBudgetLabel = `Budget pub recommandé : ≈${formatEur(round(monthlyRevenue * 0.2))}/mois (20% de ton CA du mois dernier).`;

  const actualCpa = monthlySpend / monthlyResults;
  const efficiencyRatio = Math.min(1.5, benchmark.cpa / actualCpa);

  if (actualCpa <= benchmark.cpa) {
    return {
      efficiencyRatio,
      amountEur: 0,
      explanation: `${targetBudgetLabel} Ton coût par résultat (${formatEur(round(actualCpa))}) est déjà au niveau du marché sur ce canal (≈${formatEur(round(benchmark.cpa))}).`,
    };
  }

  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  if (dealPrice.price === null) {
    return {
      efficiencyRatio,
      amountEur: null,
      explanation: `${targetBudgetLabel} Configure ton offre principale (prix) dans Mon business pour chiffrer ce gain.`,
    };
  }

  const extraResults = monthlySpend / benchmark.cpa - monthlySpend / actualCpa;

  if (benchmark.isEcommerce) {
    const amount = round(extraResults * dealPrice.price);
    return {
      efficiencyRatio,
      amountEur: amount,
      explanation: `En atteignant le coût par client benchmark de ce canal (≈${formatEur(round(benchmark.cpa))} vs ${formatEur(round(actualCpa))} actuellement), ton budget actuel te ramènerait ≈${Math.round(extraResults * 10) / 10} clients de plus × ${formatEur(round(dealPrice.price))}.`,
    };
  }

  const closingRate = buildRates(settingTotals, closingTotals).closingRate;
  if (closingRate === null) {
    return {
      efficiencyRatio,
      amountEur: null,
      explanation: `${targetBudgetLabel} Renseigne tes appels/ventes pour chiffrer ce gain (leads → clients).`,
    };
  }
  const amount = round(extraResults * closingRate * dealPrice.price);
  return {
    efficiencyRatio,
    amountEur: amount,
    explanation: `En atteignant le coût par lead benchmark de ce canal (≈${formatEur(round(benchmark.cpa))} vs ${formatEur(round(actualCpa))} actuellement), ton budget actuel te ramènerait ≈${Math.round(extraResults * 10) / 10} leads de plus × ${Math.round(closingRate * 100)}% de closing réel × ${formatEur(round(dealPrice.price))}.`,
  };
}

// How many extra clients per month a lever could realistically bring in,
// when there's no precise formula for it (formulaType "none") or the
// precise formula's own inputs are missing — scaled by effort as a simple,
// explainable proxy for "how much upside this kind of lever typically
// carries" (a low-effort lever like a referral program moves the needle
// less than a high-effort one like SEO, which pays off bigger if it works).
// Multiplied by the account's OWN offer price (resolveDealPrice — main
// offer price, or real avg deal size as fallback), never an invented price.
// Deliberately NOT a percent-of-revenue model (an earlier version was) —
// that undersold every lever on a business that's already making decent
// money; "a few more clients a month" is the actual unit a lever moves,
// and its € value should scale with what a client is actually worth here.
const FALLBACK_EXTRA_CLIENTS_PER_MONTH: Record<LeverCatalogEntry["effort"], number> = {
  faible: 1,
  moyen: 2,
  eleve: 3,
};

function fallbackEstimate(
  lever: LeverCatalogEntry,
  dealPrice: { price: number | null }
): { amountEur: number | null; explanation: string } {
  if (dealPrice.price === null) {
    return {
      amountEur: null,
      explanation: "Configure ton offre principale (prix) dans Mon business, ou enregistre au moins une vente, pour estimer ce levier.",
    };
  }
  const extraClients = FALLBACK_EXTRA_CLIENTS_PER_MONTH[lever.effort];
  const amount = round(extraClients * dealPrice.price);
  return {
    amountEur: amount,
    explanation: `Estimation indicative : ≈${extraClients} client${extraClients > 1 ? "s" : ""} en plus par mois × ${Math.round(dealPrice.price)}€ (prix de ton offre principale). Un ordre de grandeur pour un levier à effort ${lever.effort}, pas un calcul précis comme les leviers avec formule dédiée.`,
  };
}

type ImpactEstimate = {
  amountEur: number | null;
  rangeEur?: { min: number; max: number } | null;
  explanation: string;
  warning?: string | null;
};

// Ads, absent case: no channel/spend/results answered yet (that only exists
// once the lever is active, see estimateAdsEfficiency), so there's nothing
// real to compare a cost-per-result against. Instead: how many leads a
// PRUDENT, fixed test budget would plausibly buy at a conservative default
// cost-per-lead, converted through the account's REAL closing rate — never
// the invented one. Below the same revenue threshold priority_rules' own
// "lever_revenue_gate" uses for ranking (kept in sync deliberately, not
// derived from it — the two tables aren't linked), the amount itself is
// dampened AND a warning is surfaced on the card directly, since the sort-
// only demotion never reaches this component.
function estimateAdsAbsent(
  lever: LeverCatalogEntry,
  {
    settingTotals,
    closingTotals,
    businessProfile,
    cashContractedTotal,
    periodMonths,
  }: {
    settingTotals: FunnelTotals;
    closingTotals: ClosingTotals;
    businessProfile: BusinessProfileData;
    cashContractedTotal: number;
    periodMonths: number;
  }
): ImpactEstimate {
  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const closingRate = buildRates(settingTotals, closingTotals).closingRate;
  if (dealPrice.price === null || closingRate === null) {
    return {
      amountEur: null,
      explanation: "Configure ton offre principale (prix) et renseigne tes appels/ventes pour chiffrer ce levier.",
    };
  }

  const testBudgetPerDay = lever.formulaParams.testBudgetPerDayEur ?? 10;
  const defaultCpa = lever.formulaParams.defaultCpaEur ?? 30;
  const testBudgetMonthly = testBudgetPerDay * 30;
  const estimatedLeads = testBudgetMonthly / defaultCpa;
  const rawImpact = estimatedLeads * closingRate * dealPrice.price;

  const revenueThreshold = lever.formulaParams.revenueThresholdEur ?? 3000;
  const avgMonthlyRevenue = cashContractedTotal / periodMonths;
  const belowThreshold = avgMonthlyRevenue < revenueThreshold;
  const dampening = belowThreshold ? (lever.formulaParams.dampeningBelowThreshold ?? 0.3) : 1;
  const amount = round(rawImpact * dampening);

  const variance = lever.formulaParams.rangeVariance ?? 0.3;
  const rangeEur = { min: round(amount * (1 - variance)), max: round(amount * (1 + variance)) };

  const explanation =
    `Avec ~${formatEur(testBudgetPerDay)}/j de budget test (${formatEur(round(testBudgetMonthly))}/mois) et un coût par lead estimé à ${formatEur(defaultCpa)} (hypothèse prudente, aucun canal choisi pour l'instant), ≈${round1(estimatedLeads)} leads/mois × ${Math.round(closingRate * 100)}% de closing réel × ${formatEur(round(dealPrice.price))} (prix de ton offre principale).` +
    (belowThreshold
      ? ` Pondéré à la baisse : ton CA actuel (${formatEur(round(avgMonthlyRevenue))}/mois) est sous le seuil de ${formatEur(revenueThreshold)}/mois où la pub devient prioritaire.`
      : "");

  const warning = belowThreshold
    ? `Sécurise d'abord ton closing avant de payer du trafic. Ton CA (${formatEur(round(avgMonthlyRevenue))}/mois) ne justifie pas encore d'investir dans la pub.`
    : null;

  return { amountEur: amount, rangeEur, explanation, warning };
}

// VSL, absent case: a VSL sits upstream of the call, so its effect is
// modeled as an uplift on the CURRENT booking volume (settingTotals.
// callsBooked) rather than a brand-new source of traffic — uplift is a
// deliberately wide, prudent range (20-40% relative) rather than a single
// number, since there's no VSL-specific performance data anywhere in this
// app to calibrate a tighter estimate from (see plan's research: no VSL
// starter page, no tracked view/completion rate).
function estimateVslAbsent(
  lever: LeverCatalogEntry,
  {
    settingTotals,
    closingTotals,
    businessProfile,
    cashContractedTotal,
  }: {
    settingTotals: FunnelTotals;
    closingTotals: ClosingTotals;
    businessProfile: BusinessProfileData;
    cashContractedTotal: number;
  }
): ImpactEstimate {
  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const closingRate = buildRates(settingTotals, closingTotals).closingRate;
  const callsBooked = settingTotals.callsBooked;

  if (dealPrice.price === null || closingRate === null || callsBooked === 0) {
    return {
      amountEur: null,
      explanation: "Renseigne tes appels réservés et tes ventes pour chiffrer ce levier.",
    };
  }

  const upliftMin = lever.formulaParams.upliftMin ?? 0.2;
  const upliftMax = lever.formulaParams.upliftMax ?? 0.4;
  const amountMin = round(callsBooked * upliftMin * closingRate * dealPrice.price);
  const amountMax = round(callsBooked * upliftMax * closingRate * dealPrice.price);
  const amount = round((amountMin + amountMax) / 2);

  return {
    amountEur: amount,
    rangeEur: { min: amountMin, max: amountMax },
    explanation: `${callsBooked} appels réservés × +${Math.round(upliftMin * 100)} à ${Math.round(upliftMax * 100)}% de prise de RDV en plus (estimation prudente) × ${Math.round(closingRate * 100)}% de closing réel × ${formatEur(round(dealPrice.price))}. Une VSL travaille 24/7 sans coût marginal une fois tournée.`,
  };
}

function estimateImpact(
  lever: LeverCatalogEntry,
  {
    settingTotals,
    closingTotals,
    businessProfile,
    cashContractedTotal,
    periodMonths,
  }: {
    settingTotals: FunnelTotals;
    closingTotals: ClosingTotals;
    businessProfile: BusinessProfileData;
    cashContractedTotal: number;
    periodMonths: number;
  }
): ImpactEstimate {
  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const fallback = () => fallbackEstimate(lever, dealPrice);

  if (lever.formulaType === "ads_test_budget_x_closing_x_price") {
    return estimateAdsAbsent(lever, { settingTotals, closingTotals, businessProfile, cashContractedTotal, periodMonths });
  }

  if (lever.formulaType === "traffic_uplift_x_price") {
    return estimateVslAbsent(lever, { settingTotals, closingTotals, businessProfile, cashContractedTotal });
  }

  if (lever.formulaType === "leads_x_rate_x_closing_x_price") {
    const rate = lever.formulaParams.rate ?? 0;
    const rates = buildRates(settingTotals, closingTotals);
    const closingRate = rates.closingRate;
    const leadsActifs = settingTotals.newSubscribers;
    if (closingRate === null || dealPrice.price === null || leadsActifs === 0) {
      return fallback();
    }
    const amount = round(leadsActifs * rate * closingRate * dealPrice.price);
    return {
      amountEur: amount,
      explanation: `${leadsActifs} leads actifs × ${Math.round(rate * 100)}% de clic × ${Math.round(closingRate * 100)}% de closing réel × ${Math.round(dealPrice.price)}€ (prix de ton offre principale).`,
    };
  }

  if (lever.formulaType === "clients_x_takerate_x_price_fraction") {
    const takeRate = lever.formulaParams.takeRate ?? 0;
    const priceFraction = lever.formulaParams.priceFraction ?? 0;
    const clientsPerMonth = closingTotals.salesClosed / periodMonths;
    // Prefers a REAL upsell-flagged offer's own price (businessProfile.sales.
    // offers[].isUpsell) over the generic priceFraction-of-main-offer proxy —
    // the user has already conceived a concrete ascension offer, so its own
    // price is a better number than a fraction of an unrelated main offer.
    // priceFraction stays the fallback for "no ascension offer defined yet".
    const upsellOffer = businessProfile.sales.offers.find((offer) => offer.isUpsell && offer.price !== null);
    const upsellPrice = upsellOffer?.price ?? (dealPrice.price !== null ? dealPrice.price * priceFraction : null);
    if (upsellPrice === null || clientsPerMonth === 0) {
      return fallback();
    }
    const amount = round(clientsPerMonth * takeRate * upsellPrice);
    const explanation = upsellOffer
      ? `${round1(clientsPerMonth)} clients/mois × ${Math.round(takeRate * 100)}% de take-rate benchmark × ${formatEur(round(upsellPrice))} (prix de "${upsellOffer.name || "ton offre d'ascension"}").`
      : `${round1(clientsPerMonth)} clients/mois × ${Math.round(takeRate * 100)}% de take-rate benchmark × ${Math.round(priceFraction * 100)}% du prix de ton offre principale (${formatEur(round(dealPrice.price ?? 0))}). Configure une offre d'ascension dédiée pour une estimation plus précise.`;
    return { amountEur: amount, explanation };
  }

  return fallback();
}

// "Actifs à surveiller" — the lever IS running, just below its own
// benchmark. Reuses the exact same formula/rate as estimateImpact above
// (never a second formula to maintain), but applied only to the GAP between
// the current stat and the benchmark, using the lever's OWN entered
// audience size (LEVER_AUDIENCE_STAT_KEY) when the user provided one —
// "combien tu laisses sur la table en restant sous le standard", grounded
// in the real number they answered for this lever, not a generic estimate.
function estimateWatchImpact(
  lever: LeverCatalogEntry,
  statValue: number,
  benchmarkValue: number,
  stats: Record<string, number | string>,
  {
    settingTotals,
    closingTotals,
    businessProfile,
    cashContractedTotal,
  }: {
    settingTotals: FunnelTotals;
    closingTotals: ClosingTotals;
    businessProfile: BusinessProfileData;
    cashContractedTotal: number;
  }
): { amountEur: number | null; explanation: string } {
  if (lever.formulaType !== "leads_x_rate_x_closing_x_price") {
    return { amountEur: null, explanation: "Pas de formule d'estimation pour ce levier pour l'instant." };
  }

  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const closingRate = buildRates(settingTotals, closingTotals).closingRate;
  const audienceStatKey = LEVER_AUDIENCE_STAT_KEY[lever.leverKey];
  const rawAudience = audienceStatKey ? stats[audienceStatKey] : undefined;
  const audience = typeof rawAudience === "number" ? rawAudience : settingTotals.newSubscribers;

  if (closingRate === null || dealPrice.price === null || audience <= 0) {
    return { amountEur: null, explanation: "Pas encore assez de données pour chiffrer ce gain." };
  }

  const rate = lever.formulaParams.rate ?? 0;
  const gapFraction = Math.max(0, benchmarkValue - statValue);
  const missedLeads = audience * gapFraction;
  const amount = round(missedLeads * rate * closingRate * dealPrice.price);

  return {
    amountEur: amount,
    explanation: `En comblant l'écart (${Math.round(statValue * 100)}% → ${Math.round(benchmarkValue * 100)}%) sur ${Math.round(audience)} de ton audience${audienceStatKey ? " (celle que tu as renseignée)" : ""} × ${Math.round(rate * 100)}% de clic × ${Math.round(closingRate * 100)}% de closing réel × ${Math.round(dealPrice.price)}€.`,
  };
}

// Cached per-request, keyed by the plain accountId string (React's cache()
// memoizes correctly on primitive args, unlike the object-shaped params
// computeLeverOpportunities itself takes) — this exact query was being
// fired once per agent builder that calls this function (up to 3x
// concurrently per Copilote page load, for the same account), which is
// what caused the intermittent server-side hang on /copilote (see
// lib/levers/catalog.ts's getLeversCatalog for the full explanation).
const getAnsweredLeverRows = cache(async (accountId: string) => {
  return db.select().from(businessLevers).where(eq(businessLevers.userId, accountId));
});

export async function computeLeverOpportunities({
  accountId,
  businessProfile,
  settingTotals,
  closingTotals,
  cashContractedTotal,
  periodMonths,
  months,
}: {
  accountId: string;
  businessProfile: BusinessProfileData;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  cashContractedTotal: number;
  periodMonths: number;
  months: MonthWindow[];
}): Promise<{ toImplement: LeverOpportunity[]; toWatch: LeverWatchItem[]; strong: LeverWatchItem[] }> {
  const [catalog, answeredRows] = await Promise.all([getLeversCatalog(), getAnsweredLeverRows(accountId)]);
  const answeredByKey = new Map(answeredRows.map((row) => [row.leverKey, row]));

  const toImplement: LeverOpportunity[] = [];
  const toWatch: LeverWatchItem[] = [];
  // Active levers AT OR ABOVE their own benchmark — the branch every loop
  // below silently discarded until now (only "below benchmark" was ever
  // collected, into toWatch). Same shape/scoring as toWatch, just the
  // flipped comparison — feeds Diagnostic's "Tes points forts" collapsed
  // list, not a new formula.
  const strong: LeverWatchItem[] = [];

  for (const lever of catalog) {
    const profileStatus = lever.readsFromProfile ? resolveFromBusinessProfile(lever.leverKey, businessProfile) : null;
    const status = profileStatus ?? answeredByKey.get(lever.leverKey)?.status ?? "not_answered";

    // Never generate an opportunity for a lever nobody has answered yet —
    // only explicit "absent" declarations do (explicit rule from the brief).
    if (status === "absent") {
      const { amountEur, rangeEur, explanation, warning } = estimateImpact(lever, {
        settingTotals,
        closingTotals,
        businessProfile,
        cashContractedTotal,
        periodMonths,
      });
      toImplement.push({
        leverKey: lever.leverKey,
        label: lever.label,
        category: lever.category,
        effort: lever.effort,
        impactAmountEur: amountEur,
        impactRangeEur: rangeEur ?? null,
        impactExplanation: explanation,
        contextSentence: LEVER_CONTEXT_SENTENCE[lever.leverKey] ?? null,
        warning: warning ?? null,
      });
    }

    // "ads" doesn't use the generic benchmarkStatKey/benchmarkValue gate
    // above (its benchmark depends on the chosen channel) — see
    // estimateAdsEfficiency. efficiencyRatio/1 reuses the same
    // score-against-benchmark shape as every other toWatch entry (>=1 means
    // at or above market efficiency).
    if (status === "active" && lever.leverKey === "ads") {
      const stats = answeredByKey.get(lever.leverKey)?.stats ?? {};
      const result = estimateAdsEfficiency(stats, { settingTotals, closingTotals, businessProfile, cashContractedTotal, periodMonths });
      if (result) {
        const entry: LeverWatchItem = {
          leverKey: lever.leverKey,
          label: lever.label,
          category: lever.category,
          statValue: result.efficiencyRatio,
          benchmarkValue: 1,
          score: scoreAgainstBenchmark(result.efficiencyRatio, 1),
          impactAmountEur: result.amountEur,
          impactExplanation: result.explanation,
        };
        if (result.efficiencyRatio < 1) toWatch.push(entry);
        else strong.push(entry);
      }
    }

    // Email CTR — see EMAIL_CTR_BENCHMARK's comment: a second, independent
    // check on top of the generic openRate one below (levers_catalog only
    // has room for one benchmarkStatKey per row), same special-case shape
    // as "ads". statKey differentiates it from the openRate entry in the
    // unified list even though both share leverKey "email_marketing".
    if (status === "active" && lever.leverKey === "email_marketing") {
      const stats = answeredByKey.get(lever.leverKey)?.stats ?? {};
      const rawCtr = stats.ctr;
      const ctr = typeof rawCtr === "number" ? rawCtr / 100 : null;
      if (ctr !== null) {
        const entry: LeverWatchItem = {
          leverKey: lever.leverKey,
          label: lever.label,
          category: lever.category,
          statValue: ctr,
          benchmarkValue: EMAIL_CTR_BENCHMARK,
          score: scoreAgainstBenchmark(ctr, EMAIL_CTR_BENCHMARK),
          impactAmountEur: null, // no dedicated formula for CTR alone — the lever's overall gain is already carried by its openRate entry
          impactExplanation: "Impact déjà chiffré via le taux d'ouverture de ce même levier.",
          statKey: "ctr",
        };
        if (ctr < EMAIL_CTR_BENCHMARK) toWatch.push(entry);
        else strong.push(entry);
      }
    }

    // Upsell take-rate — computed from REAL sales (same formula as
    // Mon business and buildUpsellData in
    // lib/agent/lever-agent-data.ts), not a self-declared Découverte stat:
    // upsell_ascension's catalog row has no questions/benchmarkStatKey at
    // all, and a real, continuously-updated number is more reliable than
    // a one-time guess. Excluded below UPSELL_MIN_SALES to avoid advising
    // on a rate that a couple of sales could swing wildly.
    if (status === "active" && lever.leverKey === "upsell_ascension") {
      const allSales = await getSales(accountId);
      const periodSales = allSales.filter((sale) => months.some(({ range }) => inRange(sale.saleDate, range)));
      if (periodSales.length >= UPSELL_MIN_SALES) {
        const takeRate = periodSales.filter((sale) => sale.hasUpsell).length / periodSales.length;
        const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
        const gapFraction = Math.max(0, UPSELL_TAKE_RATE_BENCHMARK - takeRate);
        const clientsPerMonth = periodSales.length / periodMonths;
        const priceFraction = lever.formulaParams.priceFraction ?? 0; // same catalog-configured value estimateImpact() reads for this lever's "absent" case
        const amountEur = dealPrice.price === null ? null : round(clientsPerMonth * gapFraction * dealPrice.price * priceFraction);
        const entry: LeverWatchItem = {
          leverKey: lever.leverKey,
          label: lever.label,
          category: lever.category,
          statValue: takeRate,
          benchmarkValue: UPSELL_TAKE_RATE_BENCHMARK,
          score: scoreAgainstBenchmark(takeRate, UPSELL_TAKE_RATE_BENCHMARK),
          impactAmountEur: amountEur,
          impactExplanation:
            amountEur === null
              ? "Configure ton offre principale (prix) dans Mon business pour chiffrer ce gain."
              : `En comblant l'écart (${Math.round(takeRate * 100)}% → ${Math.round(UPSELL_TAKE_RATE_BENCHMARK * 100)}%) sur ${Math.round(clientsPerMonth * 10) / 10} client(s)/mois.`,
        };
        if (takeRate < UPSELL_TAKE_RATE_BENCHMARK) toWatch.push(entry);
        else strong.push(entry);
      }
    }

    if (status === "active" && lever.leverKey !== "ads" && lever.benchmarkStatKey && lever.benchmarkValue !== null) {
      const stats = answeredByKey.get(lever.leverKey)?.stats ?? {};
      const rawValue = stats[lever.benchmarkStatKey];
      const statValue = typeof rawValue === "number" ? rawValue / 100 : null; // stats stored as whole percents (e.g. 35), benchmarkValue is a 0-1 fraction
      if (statValue !== null && statValue < lever.benchmarkValue) {
        const { amountEur, explanation } = estimateWatchImpact(lever, statValue, lever.benchmarkValue, stats, {
          settingTotals,
          closingTotals,
          businessProfile,
          cashContractedTotal,
        });
        toWatch.push({
          leverKey: lever.leverKey,
          label: lever.label,
          category: lever.category,
          statValue,
          benchmarkValue: lever.benchmarkValue,
          score: scoreAgainstBenchmark(statValue, lever.benchmarkValue),
          impactAmountEur: amountEur,
          impactExplanation: explanation,
        });
      } else if (statValue !== null) {
        strong.push({
          leverKey: lever.leverKey,
          label: lever.label,
          category: lever.category,
          statValue,
          benchmarkValue: lever.benchmarkValue,
          score: scoreAgainstBenchmark(statValue, lever.benchmarkValue),
          impactAmountEur: null,
          impactExplanation: "Ce levier est déjà au niveau du benchmark, pas de manque à gagner à chiffrer ici.",
        });
      }
    }
  }

  toImplement.sort((a, b) => (b.impactAmountEur ?? -1) - (a.impactAmountEur ?? -1));
  toWatch.sort((a, b) => a.score - b.score);
  strong.sort((a, b) => b.score - a.score);

  return { toImplement, toWatch, strong };
}
