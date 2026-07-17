import type { settingKpiEntries } from "@/db/schema";

type SettingKpiEntry = typeof settingKpiEntries.$inferSelect;

export type FunnelTotals = {
  newSubscribers: number;
  firstMessagesSent: number;
  conversationsStarted: number;
  callsProposed: number;
  callsBooked: number;
};

// Sums happen here, in code — never sent pre-aggregated to any model later,
// per CLAUDE.md.
export function aggregateEntries(entries: SettingKpiEntry[]): FunnelTotals {
  return entries.reduce<FunnelTotals>(
    (totals, entry) => ({
      newSubscribers: totals.newSubscribers + entry.newSubscribers,
      firstMessagesSent: totals.firstMessagesSent + entry.firstMessagesSent,
      conversationsStarted: totals.conversationsStarted + entry.conversationsStarted,
      callsProposed: totals.callsProposed + entry.callsProposed,
      callsBooked: totals.callsBooked + entry.callsBooked,
    }),
    {
      newSubscribers: 0,
      firstMessagesSent: 0,
      conversationsStarted: 0,
      callsProposed: 0,
      callsBooked: 0,
    }
  );
}

export type FunnelRates = {
  outreachRate: number | null;
  responseRate: number | null;
  proposalRate: number | null;
  bookingRate: number | null;
};

export type FunnelStage = keyof FunnelRates;

export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

// responseRate is the one KPI that's calculated, never asked for directly.
export function computeFunnelRates(totals: FunnelTotals): FunnelRates {
  return {
    outreachRate: rate(totals.firstMessagesSent, totals.newSubscribers),
    responseRate: rate(totals.conversationsStarted, totals.firstMessagesSent),
    proposalRate: rate(totals.callsProposed, totals.conversationsStarted),
    bookingRate: rate(totals.callsBooked, totals.callsProposed),
  };
}

export const STAGE_LABELS: Record<FunnelStage, string> = {
  outreachRate: "Taux de prise de contact",
  responseRate: "Taux de réponse",
  proposalRate: "Taux de proposition d'appel",
  bookingRate: "Taux de réservation",
};

// Placeholder copy — meant to be swapped for the real per-stage insights;
// the shape (one entry per FunnelStage) is what matters and won't change.
export const STAGE_TIPS: Record<FunnelStage, string> = {
  outreachRate:
    "Une partie de tes nouveaux abonnés ne reçoit jamais de premier message : vérifie ton délai d'envoi.",
  responseRate:
    "Beaucoup de premiers messages restent sans réponse : le message d'ouverture ou le moment d'envoi est probablement à revoir.",
  proposalRate:
    "Des conversations démarrent mais n'aboutissent pas à une proposition d'appel : regarde où la conversation décroche.",
  bookingRate:
    "Des appels sont proposés mais pas réservés : le lien de réservation ou le suivi post-proposition est probablement le point à corriger.",
};

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export type Bottleneck = { stage: FunnelStage; rate: number };

export function findBottleneck(rates: FunnelRates): Bottleneck | null {
  let worst: Bottleneck | null = null;
  for (const stage of Object.keys(rates) as FunnelStage[]) {
    const value = rates[stage];
    if (value === null) continue;
    if (worst === null || value < worst.rate) {
      worst = { stage, rate: value };
    }
  }
  return worst;
}
