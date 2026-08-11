import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import type { BusinessProfileData } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";
import { toIsoDate, todayUtc, type DateRange } from "@/lib/date-range";
import { computeClosingRates } from "@/lib/closing/metrics";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { isMonthlyCallSourceAvailable, monthKey, type MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import {
  CLOSING_FIELDS,
  SETTING_FIELDS,
  resolveMonthCashCollected,
  resolveMonthClosingTotals,
  resolveMonthNewCustomers,
  resolveMonthSettingTotals,
} from "@/lib/monthly-metrics/resolve";
import { formatPercent } from "@/lib/setting/funnel";
import { summarize } from "@/lib/sales/installments";
import type { SaleRow } from "@/lib/sales/types";

type SettingEntry = typeof settingKpiEntries.$inferSelect;
type ClosingEntry = typeof closingKpiEntries.$inferSelect;

const MONTHS = 8;

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

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
function monthBuckets(count: number, locale = "fr-FR"): MonthBucket[] {
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
      label: first.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }),
    });
  }

  return buckets;
}

// unitLabel defaults to the Dashboard's own month-over-month cards (every
// existing call site below is unaffected) — lib/dashboard/weekly-report.ts
// reuses this exact same diff/sign logic for its week-over-week cards,
// passing "semaine précédente" instead of inventing a second delta
// computation.
export function countDelta(
  current: number,
  previous: number,
  unitLabel?: string,
  locale = "fr-FR",
): { label: string; direction: "up" | "down" | null } {
  const resolvedUnitLabel = unitLabel ?? (locale === "en" ? "previous month" : "mois précédent");
  const diff = current - previous;
  if (diff === 0) return { label: `= vs ${resolvedUnitLabel}`, direction: null };
  const sign = diff > 0 ? "+" : "";
  return { label: `${sign}${formatNumber(diff, locale)} vs ${resolvedUnitLabel}`, direction: diff > 0 ? "up" : "down" };
}

export function rateDelta(
  current: number | null,
  previous: number | null,
  unitLabel?: string,
  locale = "fr-FR",
): { label: string; direction: "up" | "down" | null } | null {
  const resolvedUnitLabel = unitLabel ?? (locale === "en" ? "previous month" : "mois précédent");
  if (current === null || previous === null) return null;
  const diffPts = Math.round((current - previous) * 100);
  if (diffPts === 0) return { label: `= vs ${resolvedUnitLabel}`, direction: null };
  const sign = diffPts > 0 ? "+" : "";
  return { label: `${sign}${formatNumber(diffPts, locale)} pts vs ${resolvedUnitLabel}`, direction: diffPts > 0 ? "up" : "down" };
}

export function buildMetricCards({
  businessProfile,
  allSettingEntries,
  allClosingEntries,
  allMonthlyRows,
  allSales = [],
  callSourcesByMonth = {},
  isStripeConnected,
  locale = "fr-FR",
}: {
  businessProfile: BusinessProfileData;
  allSettingEntries: SettingEntry[];
  allClosingEntries: ClosingEntry[];
  allMonthlyRows: MonthlyMetricsRow[];
  allSales?: SaleRow[];
  callSourcesByMonth?: Record<string, MonthlyCallSource>;
  // Whether stripeConnections has a row for this account — no longer a live
  // fetch (lib/stripe/sync-write.ts persists straight into monthlyRow, see
  // resolveMonthCashCollected/resolveMonthNewCustomers below), just gates the
  // "missing data" card copy (connected-but-not-yet-synced vs never connected).
  isStripeConnected: boolean;
  locale?: string;
}): MetricCard[] {
  const intlLocale = locale === "en" ? "en-GB" : "fr-FR";
  const buckets = monthBuckets(MONTHS, intlLocale);

  const resolved = buckets.map((bucket) => {
    const monthlyRow = allMonthlyRows.find((row) => row.year === bucket.year && row.month === bucket.month) ?? null;
    const dailySetting = allSettingEntries.filter((entry) => inRange(entry.date, bucket.range));
    const dailyClosing = allClosingEntries.filter((entry) => inRange(entry.date, bucket.range));
    // Closing overrides only protect calls-taken/sales-closed. A manual
    // closing correction must not hide the same month's canonical booked-call
    // source from the acquisition cards.
    const callSource = callSourcesByMonth[monthKey(bucket.year, bucket.month)] ?? null;
    const validSalesInMonth = allSales.filter((sale) => !sale.isOrphan && inRange(sale.saleDate, bucket.range));

    const baseSettingTotals = resolveMonthSettingTotals(monthlyRow, dailySetting);
    const monthlySettingIsAuthoritative = Boolean(
      monthlyRow?.settingManualOverride ||
        (monthlyRow && SETTING_FIELDS.some((field) => monthlyRow[field] !== null))
    );
    const monthlyClosingIsAuthoritative = Boolean(
      monthlyRow?.closingManualOverride ||
        (monthlyRow && CLOSING_FIELDS.some((field) => monthlyRow[field] !== null))
    );
    const callSourceIsAvailable = isMonthlyCallSourceAvailable(callSource);
    const settingTotals = callSourceIsAvailable && !monthlySettingIsAuthoritative
      ? { ...baseSettingTotals, callsBooked: callSource.callsBooked }
      : baseSettingTotals;
    const baseClosingTotals = resolveMonthClosingTotals(monthlyRow, dailyClosing);
    const closingTotals = monthlyClosingIsAuthoritative
      ? baseClosingTotals
      : {
          callsAttended: callSourceIsAvailable ? callSource.callsTaken : baseClosingTotals.callsAttended,
          salesClosed: validSalesInMonth.length > 0
            ? validSalesInMonth.length
            : callSourceIsAvailable
              ? callSource.salesClosed
              : baseClosingTotals.salesClosed,
        };
    const closingRates = computeClosingRates(closingTotals, settingTotals.callsBooked);
    const salesCollected = allSales
      .filter((sale) => !sale.isOrphan && inRange(sale.saleDate, bucket.range))
      .reduce((sum, sale) => sum + summarize(sale.totalPrice, sale.installments).paidTotal, 0);
    const stripeOrManualCash = resolveMonthCashCollected(monthlyRow);
    const cash = salesCollected > 0 ? { amount: salesCollected, source: "sales" as const } : stripeOrManualCash;
    const newCustomers = resolveMonthNewCustomers(monthlyRow);

    return { bucket, monthlyRow, settingTotals, closingTotals, closingRates, cash, newCustomers };
  });

  const current = resolved[resolved.length - 1];
  const previous = resolved[resolved.length - 2];

  const hasAnySettingData = allSettingEntries.length > 0 || allMonthlyRows.some((row) => row.newFollowers !== null || row.callsBooked !== null);
  const hasAnyBookingsData = hasAnySettingData || Object.values(callSourcesByMonth).some(isMonthlyCallSourceAvailable);
  const hasAnyClosingData =
    allClosingEntries.length > 0 ||
    Object.values(callSourcesByMonth).some(isMonthlyCallSourceAvailable) ||
    allMonthlyRows.some((row) => row.callsTaken !== null || row.salesClosed !== null) ||
    allSales.some((sale) => !sale.isOrphan);
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
    const delta = countDelta(Math.round(current.cash.amount), Math.round(previousAmount), undefined, intlLocale);
    cards.push({
      key: "revenue",
      label: "CA encaissé",
      href: "/datas",
      status: "ok",
      valueLabel: formatEur(current.cash.amount, intlLocale),
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
    const delta = countDelta(current.newCustomers.amount, previousCount, undefined, intlLocale);
    cards.push({
      key: "new-customers",
      label: "Nouveaux clients",
      href: "/integrations",
      status: "ok",
      valueLabel: formatNumber(current.newCustomers.amount, intlLocale),
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
      const delta = countDelta(current.settingTotals.newSubscribers, previous.settingTotals.newSubscribers, undefined, intlLocale);
      cards.push({
        key: "leads",
        label: "Leads générés",
        href: "/datas",
        status: "ok",
        valueLabel: formatNumber(current.settingTotals.newSubscribers, intlLocale),
        deltaLabel: delta.label,
        deltaDirection: delta.direction,
        sparklineValues: resolved.map((r) => r.settingTotals.newSubscribers),
        sparklineLabels: resolved.map((r) => r.bucket.label),
      });
    }

    // 4. RDV réservés
    if (!hasAnyBookingsData) {
      cards.push({
        key: "bookings",
        label: "RDV réservés",
        href: "/datas",
        status: "missing",
        reason: "Rien saisi pour l'instant",
        ctaLabel: "Remplir dans Datas",
      });
    } else {
      const delta = countDelta(current.settingTotals.callsBooked, previous.settingTotals.callsBooked, undefined, intlLocale);
      cards.push({
        key: "bookings",
        label: "RDV réservés",
        href: "/datas",
        status: "ok",
        valueLabel: formatNumber(current.settingTotals.callsBooked, intlLocale),
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
    const delta = rateDelta(current.closingRates.closingRate, previous.closingRates.closingRate, undefined, intlLocale);
    cards.push({
      key: "closing-rate",
      label: "Taux de closing",
      href: "/datas",
      status: "ok",
      valueLabel: current.closingRates.closingRate === null ? "—" : formatPercent(current.closingRates.closingRate, intlLocale),
      deltaLabel: delta?.label ?? null,
      deltaDirection: delta?.direction ?? null,
      sparklineValues: resolved.map((r) => r.closingRates.closingRate ?? 0),
      sparklineLabels: resolved.map((r) => r.bucket.label),
    });
  }

  // 6. Taux de show up — same closingRates already computed above (card 5),
  // just a different field of it. Gated on hasAnyClosingData like closing
  // rate: showUpRate depends on both callsAttended (closing) and callsBooked
  // (setting), but closing data is the one actually missing when neither is
  // filled in yet.
  if (!hasAnyClosingData) {
    cards.push({
      key: "show-up-rate",
      label: "Taux de show up",
      href: "/datas",
      status: "missing",
      reason: "Rien saisi pour l'instant",
      ctaLabel: "Remplir dans Datas",
    });
  } else {
    const delta = rateDelta(current.closingRates.showUpRate, previous.closingRates.showUpRate, undefined, intlLocale);
    cards.push({
      key: "show-up-rate",
      label: "Taux de show up",
      href: "/datas",
      status: "ok",
      valueLabel: current.closingRates.showUpRate === null ? "—" : formatPercent(current.closingRates.showUpRate, intlLocale),
      deltaLabel: delta?.label ?? null,
      deltaDirection: delta?.direction ?? null,
      sparklineValues: resolved.map((r) => r.closingRates.showUpRate ?? 0),
      sparklineLabels: resolved.map((r) => r.bucket.label),
    });
  }

  // 7. Panier moyen — resolved cash collected (same source as card 1) ÷ real
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
    const delta = previousAvg === null ? null : countDelta(Math.round(currentAvg), Math.round(previousAvg), undefined, intlLocale);
    cards.push({
      key: "average-sale",
      label: "Panier moyen",
      href: "/datas",
      status: "ok",
      valueLabel: formatEur(currentAvg, intlLocale),
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
