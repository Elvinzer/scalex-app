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

  if (lever.formulaType === "leads_x_rate_x_closing_x_price") {
    const rate = lever.formulaParams.rate ?? 0;
    const rates = buildRates(settingTotals, closingTotals);
    const closingRate = rates.closingRate;
    const leadsActifs = settingTotals.newSubscribers;
    if (closingRate === null || dealPrice.price === null || leadsActifs === 0) {
      return { amountEur: null, explanation: "Pas encore assez de données pour chiffrer ce levier." };
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
      return { amountEur: null, explanation: "Pas encore assez de données pour chiffrer ce levier." };
    }
    const amount = round(clientsPerMonth * takeRate * dealPrice.price * priceFraction);
    return {
      amountEur: amount,
      explanation: `${Math.round(clientsPerMonth * 10) / 10} clients/mois × ${Math.round(takeRate * 100)}% de take-rate × ${Math.round(priceFraction * 100)}% du prix de ton offre principale (${Math.round(dealPrice.price)}€).`,
    };
  }

  return { amountEur: null, explanation: "Pas de formule d'estimation pour ce levier pour l'instant." };
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
        toWatch.push({
          leverKey: lever.leverKey,
          label: lever.label,
          category: lever.category,
          statValue,
          benchmarkValue: lever.benchmarkValue,
          score: scoreAgainstBenchmark(statValue, lever.benchmarkValue),
        });
      }
    }
  }

  toImplement.sort((a, b) => (b.impactAmountEur ?? -1) - (a.impactAmountEur ?? -1));
  toWatch.sort((a, b) => a.score - b.score);

  return { toImplement, toWatch };
}
