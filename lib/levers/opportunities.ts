import { eq } from "drizzle-orm";

import { db } from "@/db";
import { businessLevers } from "@/db/schema";
import type { ClosingTotals } from "@/lib/closing/metrics";
import { buildRates, resolveDealPrice } from "@/lib/diagnostic/cascade";
import type { FunnelTotals } from "@/lib/setting/funnel";
import type { BusinessProfileData } from "@/lib/business/types";
import { getLeversCatalog, resolveFromBusinessProfile, type LeverCatalogEntry } from "./catalog";

export type LeverOpportunity = {
  leverKey: string;
  label: string;
  category: LeverCatalogEntry["category"];
  effort: LeverCatalogEntry["effort"];
  impactAmountEur: number | null; // null = "Impact : à évaluer"
  impactExplanation: string;
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

function round(value: number): number {
  return Math.round(value);
}

// Same shape of reasoning as lib/diagnostic/cascade.ts's computeHealthScore
// (ratio-to-benchmark, capped 0-100) but deliberately NOT that function or
// that type — this scores levers outside the 5-key cascade union on
// purpose (see db/schema.ts's comment above leversCatalog).
function scoreAgainstBenchmark(current: number, benchmark: number): number {
  const ratio = current / benchmark;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
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
): { amountEur: number | null; explanation: string } {
  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const fallback = () => fallbackEstimate(lever, dealPrice);

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
    if (dealPrice.price === null || clientsPerMonth === 0) {
      return fallback();
    }
    const amount = round(clientsPerMonth * takeRate * dealPrice.price * priceFraction);
    return {
      amountEur: amount,
      explanation: `${Math.round(clientsPerMonth * 10) / 10} clients/mois × ${Math.round(takeRate * 100)}% de take-rate × ${Math.round(priceFraction * 100)}% du prix de ton offre principale (${Math.round(dealPrice.price)}€).`,
    };
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

export async function computeLeverOpportunities({
  accountId,
  businessProfile,
  settingTotals,
  closingTotals,
  cashContractedTotal,
  periodMonths,
}: {
  accountId: string;
  businessProfile: BusinessProfileData;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  cashContractedTotal: number;
  periodMonths: number;
}): Promise<{ toImplement: LeverOpportunity[]; toWatch: LeverWatchItem[] }> {
  const [catalog, answeredRows] = await Promise.all([
    getLeversCatalog(),
    db.select().from(businessLevers).where(eq(businessLevers.userId, accountId)),
  ]);
  const answeredByKey = new Map(answeredRows.map((row) => [row.leverKey, row]));

  const toImplement: LeverOpportunity[] = [];
  const toWatch: LeverWatchItem[] = [];

  for (const lever of catalog) {
    const profileStatus = lever.readsFromProfile ? resolveFromBusinessProfile(lever.leverKey, businessProfile) : null;
    const status = profileStatus ?? answeredByKey.get(lever.leverKey)?.status ?? "not_answered";

    // Never generate an opportunity for a lever nobody has answered yet —
    // only explicit "absent" declarations do (explicit rule from the brief).
    if (status === "absent") {
      const { amountEur, explanation } = estimateImpact(lever, {
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
        impactExplanation: explanation,
      });
    }

    if (status === "active" && lever.benchmarkStatKey && lever.benchmarkValue !== null) {
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
      }
    }
  }

  toImplement.sort((a, b) => (b.impactAmountEur ?? -1) - (a.impactAmountEur ?? -1));
  toWatch.sort((a, b) => a.score - b.score);

  return { toImplement, toWatch };
}
