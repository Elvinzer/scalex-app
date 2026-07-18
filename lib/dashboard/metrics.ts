import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import type { BusinessProfileData } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";
import {
  previousEquivalentRange,
  resolveDateRange,
  toIsoDate,
  todayUtc,
  type DateRange,
} from "@/lib/date-range";
import { aggregateClosingEntries, computeClosingRates } from "@/lib/closing/metrics";
import { aggregateEntries, formatPercent } from "@/lib/setting/funnel";

import type { StripeActivity } from "./stripe-metrics";

type SettingEntry = typeof settingKpiEntries.$inferSelect;
type ClosingEntry = typeof closingKpiEntries.$inferSelect;

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const WEEKS = 8;

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

// The single window to fetch Stripe activity over — covers both the
// current-vs-previous-30-days comparison (60 days) and the 8-week sparkline
// (56 days) from one fetch, so lib/dashboard/stripe-metrics.ts only needs to
// hit the Stripe API once per Dashboard load.
export function dashboardStripeRange(): DateRange {
  const today = todayUtc();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 59);
  return { from: toIsoDate(start), to: toIsoDate(today) };
}

function shortWeekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// 8 rolling 7-day buckets, oldest first, ending today — the closest honest
// read of "8 dernières semaines" given KPI entries are captured daily, not
// through a dedicated weekly form.
function weekBuckets(): { from: string; to: string; label: string }[] {
  const today = todayUtc();
  const buckets: { from: string; to: string; label: string }[] = [];

  for (let i = WEEKS - 1; i >= 0; i--) {
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() - i * 7);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 6);
    buckets.push({ from: toIsoDate(from), to: toIsoDate(to), label: shortWeekLabel(toIsoDate(to)) });
  }

  return buckets;
}

function countDelta(current: number, previous: number): { label: string; direction: "up" | "down" | null } {
  const diff = current - previous;
  if (diff === 0) return { label: "= vs période précédente", direction: null };
  const sign = diff > 0 ? "+" : "";
  return {
    label: `${sign}${NUMBER_FORMAT.format(diff)} vs période précédente`,
    direction: diff > 0 ? "up" : "down",
  };
}

function rateDelta(current: number | null, previous: number | null): { label: string; direction: "up" | "down" | null } | null {
  if (current === null || previous === null) return null;
  const diffPts = Math.round((current - previous) * 100);
  if (diffPts === 0) return { label: "= vs période précédente", direction: null };
  const sign = diffPts > 0 ? "+" : "";
  return { label: `${sign}${diffPts} pts vs période précédente`, direction: diffPts > 0 ? "up" : "down" };
}

export function buildMetricCards({
  businessProfile,
  allSettingEntries,
  allClosingEntries,
  stripeActivity,
}: {
  businessProfile: BusinessProfileData;
  allSettingEntries: SettingEntry[];
  allClosingEntries: ClosingEntry[];
  stripeActivity: StripeActivity | null;
}): MetricCard[] {
  const currentRange = resolveDateRange("last-30-days", undefined, undefined)!;
  const previousRange = previousEquivalentRange(currentRange);
  const buckets = weekBuckets();

  const currentSetting = allSettingEntries.filter((entry) => inRange(entry.date, currentRange));
  const previousSetting = allSettingEntries.filter((entry) => inRange(entry.date, previousRange));
  const currentClosing = allClosingEntries.filter((entry) => inRange(entry.date, currentRange));
  const previousClosing = allClosingEntries.filter((entry) => inRange(entry.date, previousRange));

  const currentSettingTotals = aggregateEntries(currentSetting);
  const previousSettingTotals = aggregateEntries(previousSetting);
  const currentClosingTotals = aggregateClosingEntries(currentClosing);
  const previousClosingTotals = aggregateClosingEntries(previousClosing);
  const currentClosingRates = computeClosingRates(currentClosingTotals, currentSettingTotals.callsBooked);
  const previousClosingRates = computeClosingRates(previousClosingTotals, previousSettingTotals.callsBooked);

  const directSalePage = businessProfile.acquisition.setting.enabled === "no";

  const revenueCents = (start: string, end: string) =>
    stripeActivity
      ? stripeActivity.charges
          .filter((charge) => {
            const iso = toIsoDate(charge.createdAt);
            return iso >= start && iso <= end;
          })
          .reduce((sum, charge) => sum + charge.amountCents, 0)
      : 0;

  const customerCount = (start: string, end: string) =>
    stripeActivity
      ? stripeActivity.customers.filter((customer) => {
          const iso = toIsoDate(customer.createdAt);
          return iso >= start && iso <= end;
        }).length
      : 0;

  const cards: MetricCard[] = [];

  // 1. CA encaissé
  if (!stripeActivity) {
    cards.push({
      key: "revenue",
      label: "CA encaissé",
      href: "/integrations",
      status: "missing",
      reason: "Stripe non connecté",
      ctaLabel: "Connecte Stripe",
    });
  } else {
    const currentEur = revenueCents(currentRange.from, currentRange.to) / 100;
    const previousEur = revenueCents(previousRange.from, previousRange.to) / 100;
    const delta = countDelta(Math.round(currentEur), Math.round(previousEur));
    cards.push({
      key: "revenue",
      label: "CA encaissé",
      href: "/funnel/closing",
      status: "ok",
      valueLabel: formatEur(currentEur),
      deltaLabel: delta.label,
      deltaDirection: delta.direction,
      sparklineValues: buckets.map((bucket) => revenueCents(bucket.from, bucket.to) / 100),
      sparklineLabels: buckets.map((bucket) => bucket.label),
    });
  }

  // 2. Nouveaux clients
  if (!stripeActivity) {
    cards.push({
      key: "new-customers",
      label: "Nouveaux clients",
      href: "/integrations",
      status: "missing",
      reason: "Stripe non connecté",
      ctaLabel: "Connecte Stripe",
    });
  } else {
    const current = customerCount(currentRange.from, currentRange.to);
    const previous = customerCount(previousRange.from, previousRange.to);
    const delta = countDelta(current, previous);
    cards.push({
      key: "new-customers",
      label: "Nouveaux clients",
      href: "/funnel/closing",
      status: "ok",
      valueLabel: NUMBER_FORMAT.format(current),
      deltaLabel: delta.label,
      deltaDirection: delta.direction,
      sparklineValues: buckets.map((bucket) => customerCount(bucket.from, bucket.to)),
      sparklineLabels: buckets.map((bucket) => bucket.label),
    });
  }

  if (!directSalePage) {
    // 3. Leads générés
    if (allSettingEntries.length === 0) {
      cards.push({
        key: "leads",
        label: "Leads générés",
        href: "/funnel/setting",
        status: "missing",
        reason: "Aucun check-in enregistré",
        ctaLabel: "Fais ton check-in",
      });
    } else {
      const delta = countDelta(currentSettingTotals.newSubscribers, previousSettingTotals.newSubscribers);
      cards.push({
        key: "leads",
        label: "Leads générés",
        href: "/funnel/setting",
        status: "ok",
        valueLabel: NUMBER_FORMAT.format(currentSettingTotals.newSubscribers),
        deltaLabel: delta.label,
        deltaDirection: delta.direction,
        sparklineValues: buckets.map((bucket) =>
          aggregateEntries(allSettingEntries.filter((entry) => inRange(entry.date, bucket)))
            .newSubscribers
        ),
        sparklineLabels: buckets.map((bucket) => bucket.label),
      });
    }

    // 4. RDV réservés
    if (allSettingEntries.length === 0) {
      cards.push({
        key: "bookings",
        label: "RDV réservés",
        href: "/funnel/setting",
        status: "missing",
        reason: "Aucun check-in enregistré",
        ctaLabel: "Fais ton check-in",
      });
    } else {
      const delta = countDelta(currentSettingTotals.callsBooked, previousSettingTotals.callsBooked);
      cards.push({
        key: "bookings",
        label: "RDV réservés",
        href: "/funnel/setting",
        status: "ok",
        valueLabel: NUMBER_FORMAT.format(currentSettingTotals.callsBooked),
        deltaLabel: delta.label,
        deltaDirection: delta.direction,
        sparklineValues: buckets.map((bucket) =>
          aggregateEntries(allSettingEntries.filter((entry) => inRange(entry.date, bucket))).callsBooked
        ),
        sparklineLabels: buckets.map((bucket) => bucket.label),
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
  if (allClosingEntries.length === 0) {
    cards.push({
      key: "closing-rate",
      label: "Taux de closing",
      href: "/funnel/closing",
      status: "missing",
      reason: "Aucun check-in enregistré",
      ctaLabel: "Fais ton check-in",
    });
  } else {
    const delta = rateDelta(currentClosingRates.closingRate, previousClosingRates.closingRate);
    cards.push({
      key: "closing-rate",
      label: "Taux de closing",
      href: "/funnel/closing",
      status: "ok",
      valueLabel: currentClosingRates.closingRate === null ? "—" : formatPercent(currentClosingRates.closingRate),
      deltaLabel: delta?.label ?? null,
      deltaDirection: delta?.direction ?? null,
      sparklineValues: buckets.map((bucket) => {
        const closing = aggregateClosingEntries(allClosingEntries.filter((entry) => inRange(entry.date, bucket)));
        const booked = aggregateEntries(allSettingEntries.filter((entry) => inRange(entry.date, bucket))).callsBooked;
        return computeClosingRates(closing, booked).closingRate ?? 0;
      }),
      sparklineLabels: buckets.map((bucket) => bucket.label),
    });
  }

  // 6. Panier moyen — real revenue ÷ real closed-sales count, not a static
  // offer price, so it stays a traceable ratio of two real numbers.
  const currentSales = currentClosingTotals.salesClosed;
  const currentRevenueEur = revenueCents(currentRange.from, currentRange.to) / 100;
  if (!stripeActivity || currentSales === 0) {
    cards.push({
      key: "average-sale",
      label: "Panier moyen",
      href: "/funnel/closing",
      status: "missing",
      reason: !stripeActivity ? "Stripe non connecté" : "Aucune vente sur la période",
      ctaLabel: !stripeActivity ? "Connecte Stripe" : "Fais ton check-in",
    });
  } else {
    const previousSales = previousClosingTotals.salesClosed;
    const previousRevenueEur = revenueCents(previousRange.from, previousRange.to) / 100;
    const currentAvg = currentRevenueEur / currentSales;
    const previousAvg = previousSales > 0 ? previousRevenueEur / previousSales : null;
    const delta = previousAvg === null ? null : countDelta(Math.round(currentAvg), Math.round(previousAvg));
    cards.push({
      key: "average-sale",
      label: "Panier moyen",
      href: "/funnel/closing",
      status: "ok",
      valueLabel: formatEur(currentAvg),
      deltaLabel: delta?.label ?? null,
      deltaDirection: delta?.direction ?? null,
      sparklineValues: buckets.map((bucket) => {
        const closing = aggregateClosingEntries(allClosingEntries.filter((entry) => inRange(entry.date, bucket)));
        if (closing.salesClosed === 0) return 0;
        return revenueCents(bucket.from, bucket.to) / 100 / closing.salesClosed;
      }),
      sparklineLabels: buckets.map((bucket) => bucket.label),
    });
  }

  return cards;
}
