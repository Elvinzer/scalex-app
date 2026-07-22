import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import type { BusinessProfileData } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";
import { toIsoDate, todayUtc, type DateRange } from "@/lib/date-range";
import { computeClosingRates } from "@/lib/closing/metrics";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import {
  resolveMonthCashCollected,
  resolveMonthClosingTotals,
  resolveMonthNewCustomers,
  resolveMonthSettingTotals,
} from "@/lib/monthly-metrics/resolve";
import { formatPercent } from "@/lib/setting/funnel";

type SettingEntry = typeof settingKpiEntries.$inferSelect;
type ClosingEntry = typeof closingKpiEntries.$inferSelect;

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const MONTHS = 8;

export type MetricCard =
  | {
      key: string;
      label: string;
      href: string;
      status: "ok";
      valueLabel: string;
      deltaLabel: string | null;
      deltaDirection: "up" | "down" | null;
      sparklineValues: number[];
      sparklineLabels: string[];
      sourceHint?: string;
    }
  | {
      key: string;
      label: string;
      href: string;
      status: "missing";
      reason: string;
      ctaLabel: string;
    };

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

// Monday-Sunday window containing today (UTC) — drives the check-in banner.
// KPI entries are daily, not a dedicated weekly form, so "check-in fait cette
// semaine" is read as "at least one entry landed since Monday."
export function currentIsoWeekRange(): DateRange {
  const today = todayUtc();
  const isoDay = today.getUTCDay() === 0 ? 7 : today.getUTCDay(); // 1 (Mon) .. 7 (Sun)
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - (isoDay - 1));
  return { from: toIsoDate(monday), to: toIsoDate(today) };
}

type MonthBucket = { year: number; month: number; range: DateRange; label: string };

// Last `count` calendar months, oldest first, ending with the current
// (possibly still-in-progress) month — the merge unit shared with
// lib/monthly-metrics/resolve.ts, since monthly_metrics can't be blended into
// a rolling day-count window.
function monthBuckets(count: number): MonthBucket[] {
  const today = todayUtc();
  const buckets: MonthBucket[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth() + 1;
    const isCurrentMonth = i === 0;
    const lastDay = new Date(Date.UTC(year, month, 0));
    const to = isCurrentMonth ? today : lastDay;

    buckets.push({
      year,
      month,
      range: { from: toIsoDate(first), to: toIsoDate(to) },
      label: first.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }),
    });
  }

  return buckets;
}

function countDelta(current: number, previous: number): { label: string; direction: "up" | "down" | null } {
  const diff = current - previous;
  if (diff === 0) return { label: "= vs mois précédent", direction: null };
  const sign = diff > 0 ? "+" : "";
  return { label: `${sign}${NUMBER_FORMAT.format(diff)} vs mois précédent`, direction: diff > 0 ? "up" : "down" };
}

function rateDelta(current: number | null, previous: number | null): { label: string; direction: "up" | "down" | null } | null {
  if (current === null || previous === null) return null;
  const diffPts = Math.round((current - previous) * 100);
  if (diffPts === 0) return { label: "= vs mois précédent", direction: null };
  const sign = diffPts > 0 ? "+" : "";
  return { label: `${sign}${diffPts} pts vs mois précédent`, direction: diffPts > 0 ? "up" : "down" };
}

export function buildMetricCards({
  businessProfile,
  allSettingEntries,
  allClosingEntries,
  allMonthlyRows,
  isStripeConnected,
}: {
  businessProfile: BusinessProfileData;
  allSettingEntries: SettingEntry[];
  allClosingEntries: ClosingEntry[];
  allMonthlyRows: MonthlyMetricsRow[];
  // Whether stripeConnections has a row for this account — no longer a live
  // fetch (lib/stripe/sync-write.ts persists straight into monthlyRow, see
  // resolveMonthCashCollected/resolveMonthNewCustomers below), just gates the
  // "missing data" card copy (connected-but-not-yet-synced vs never connected).
  isStripeConnected: boolean;
}): MetricCard[] {
  const buckets = monthBuckets(MONTHS);

  const resolved = buckets.map((bucket) => {
    const monthlyRow = allMonthlyRows.find((row) => row.year === bucket.year && row.month === bucket.month) ?? null;
    const dailySetting = allSettingEntries.filter((entry) => inRange(entry.date, bucket.range));
    const dailyClosing = allClosingEntries.filter((entry) => inRange(entry.date, bucket.range));

    const settingTotals = resolveMonthSettingTotals(monthlyRow, dailySetting);
    const closingTotals = resolveMonthClosingTotals(monthlyRow, dailyClosing);
    const closingRates = computeClosingRates(closingTotals, settingTotals.callsBooked);
    const cash = resolveMonthCashCollected(monthlyRow);
    const newCustomers = resolveMonthNewCustomers(monthlyRow);

    return { bucket, monthlyRow, settingTotals, closingTotals, closingRates, cash, newCustomers };
  });

  const current = resolved[resolved.length - 1];
  const previous = resolved[resolved.length - 2];

  const hasAnySettingData = allSettingEntries.length > 0 || allMonthlyRows.some((row) => row.newFollowers !== null || row.callsBooked !== null);
  const hasAnyClosingData = allClosingEntries.length > 0 || allMonthlyRows.some((row) => row.callsTaken !== null || row.salesClosed !== null);
  const directSalePage = businessProfile.acquisition.setting.enabled === "no";

  const cards: MetricCard[] = [];

  // 1. CA encaissé
  if (current.cash.amount === null) {
    cards.push({
      key: "revenue",
      label: "CA encaissé",
      href: "/datas",
      status: "missing",
      reason: !isStripeConnected ? "Stripe non connecté et rien saisi dans Datas" : "Rien saisi ce mois-ci",
      ctaLabel: !isStripeConnected ? "Connecte Stripe" : "Remplir dans Datas",
    });
  } else {
    const previousAmount = previous.cash.amount ?? 0;
    const delta = countDelta(Math.round(current.cash.amount), Math.round(previousAmount));
    cards.push({
      key: "revenue",
      label: "CA encaissé",
      href: "/datas",
      status: "ok",
      valueLabel: formatEur(current.cash.amount),
      deltaLabel: delta.label,
      deltaDirection: delta.direction,
      sparklineValues: resolved.map((r) => r.cash.amount ?? 0),
      sparklineLabels: resolved.map((r) => r.bucket.label),
      sourceHint:
        current.cash.source === "manual" ? "Saisie manuelle" : current.cash.source === "stripe" ? "Stripe" : undefined,
    });
  }

  // 2. Nouveaux clients — Stripe only, no manual equivalent in Datas.
  if (current.newCustomers.amount === null) {
    cards.push({
      key: "new-customers",
      label: "Nouveaux clients",
      href: "/integrations",
      status: "missing",
      reason: !isStripeConnected ? "Stripe non connecté" : "Synchronisation en cours",
      ctaLabel: "Connecte Stripe",
    });
  } else {
    const previousCount = previous.newCustomers.amount ?? 0;
    const delta = countDelta(current.newCustomers.amount, previousCount);
    cards.push({
      key: "new-customers",
      label: "Nouveaux clients",
      href: "/integrations",
      status: "ok",
      valueLabel: NUMBER_FORMAT.format(current.newCustomers.amount),
      deltaLabel: delta.label,
      deltaDirection: delta.direction,
      sparklineValues: resolved.map((r) => r.newCustomers.amount ?? 0),
      sparklineLabels: resolved.map((r) => r.bucket.label),
      sourceHint: "Stripe",
    });
  }

  if (!directSalePage) {
    // 3. Leads générés
    if (!hasAnySettingData) {
      cards.push({
        key: "leads",
        label: "Leads générés",
        href: "/datas",
        status: "missing",
        reason: "Rien saisi pour l'instant",
        ctaLabel: "Remplir dans Datas",
      });
    } else {
      const delta = countDelta(current.settingTotals.newSubscribers, previous.settingTotals.newSubscribers);
      cards.push({
        key: "leads",
        label: "Leads générés",
        href: "/datas",
        status: "ok",
        valueLabel: NUMBER_FORMAT.format(current.settingTotals.newSubscribers),
        deltaLabel: delta.label,
        deltaDirection: delta.direction,
        sparklineValues: resolved.map((r) => r.settingTotals.newSubscribers),
        sparklineLabels: resolved.map((r) => r.bucket.label),
      });
    }

    // 4. RDV réservés
    if (!hasAnySettingData) {
      cards.push({
        key: "bookings",
        label: "RDV réservés",
        href: "/datas",
        status: "missing",
        reason: "Rien saisi pour l'instant",
        ctaLabel: "Remplir dans Datas",
      });
    } else {
      const delta = countDelta(current.settingTotals.callsBooked, previous.settingTotals.callsBooked);
      cards.push({
        key: "bookings",
        label: "RDV réservés",
        href: "/datas",
        status: "ok",
        valueLabel: NUMBER_FORMAT.format(current.settingTotals.callsBooked),
        deltaLabel: delta.label,
        deltaDirection: delta.direction,
        sparklineValues: resolved.map((r) => r.settingTotals.callsBooked),
        sparklineLabels: resolved.map((r) => r.bucket.label),
      });
    }
  } else {
    // No data source exists for page-view/checkout analytics — always
    // rendered as missing, per the spec's own fallback rule.
    cards.push({
      key: "sales-page-conversion",
      label: "Taux de conversion page de vente",
      href: "/business",
      status: "missing",
      reason: "Analytics page de vente non connectées",
      ctaLabel: "Voir Mon business",
    });
    cards.push({
      key: "checkout-visitors",
      label: "Visiteurs checkout",
      href: "/business",
      status: "missing",
      reason: "Analytics page de vente non connectées",
      ctaLabel: "Voir Mon business",
    });
  }

  // 5. Taux de closing
  if (!hasAnyClosingData) {
    cards.push({
      key: "closing-rate",
      label: "Taux de closing",
      href: "/datas",
      status: "missing",
      reason: "Rien saisi pour l'instant",
      ctaLabel: "Remplir dans Datas",
    });
  } else {
    const delta = rateDelta(current.closingRates.closingRate, previous.closingRates.closingRate);
    cards.push({
      key: "closing-rate",
      label: "Taux de closing",
      href: "/datas",
      status: "ok",
      valueLabel: current.closingRates.closingRate === null ? "—" : formatPercent(current.closingRates.closingRate),
      deltaLabel: delta?.label ?? null,
      deltaDirection: delta?.direction ?? null,
      sparklineValues: resolved.map((r) => r.closingRates.closingRate ?? 0),
      sparklineLabels: resolved.map((r) => r.bucket.label),
    });
  }

  // 6. Panier moyen — resolved cash collected (same source as card 1) ÷ real
  // closed-sales count, so it stays consistent with whichever source (Stripe
  // or manual) is currently backing the revenue figure.
  if (current.cash.amount === null || current.closingTotals.salesClosed === 0) {
    cards.push({
      key: "average-sale",
      label: "Panier moyen",
      href: "/datas",
      status: "missing",
      reason: current.cash.amount === null ? "Aucun revenu connu ce mois-ci" : "Aucune vente ce mois-ci",
      ctaLabel: "Remplir dans Datas",
    });
  } else {
    const currentAvg = current.cash.amount / current.closingTotals.salesClosed;
    const previousAvg =
      previous.cash.amount !== null && previous.closingTotals.salesClosed > 0
        ? previous.cash.amount / previous.closingTotals.salesClosed
        : null;
    const delta = previousAvg === null ? null : countDelta(Math.round(currentAvg), Math.round(previousAvg));
    cards.push({
      key: "average-sale",
      label: "Panier moyen",
      href: "/datas",
      status: "ok",
      valueLabel: formatEur(currentAvg),
      deltaLabel: delta?.label ?? null,
      deltaDirection: delta?.direction ?? null,
      sparklineValues: resolved.map((r) =>
        r.cash.amount !== null && r.closingTotals.salesClosed > 0 ? r.cash.amount / r.closingTotals.salesClosed : 0
      ),
      sparklineLabels: resolved.map((r) => r.bucket.label),
    });
  }

  return cards;
}
