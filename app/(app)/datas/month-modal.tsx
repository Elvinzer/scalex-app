"use client";

import { ChevronLeft, ChevronRight, PencilLine, Phone, Send, Sparkles, WalletCards, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";

import { KpiNumberField, type KpiFieldSource } from "@/components/kpi-number-field";
import { MonthlyKpiImport, type MonthlyKpiImportUsage } from "@/components/import/monthly-kpi-import";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { formatEur } from "@/lib/currency";
import { computeClosingRates } from "@/lib/closing/metrics";
import { monthDateRange } from "@/lib/date-range";
import type { MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { CLOSING_FIELDS, resolveDailySourceOverlay, resolveMonthCashCollected, resolveMonthNewCustomers, SETTING_FIELDS, stripDailySourcedFields } from "@/lib/monthly-metrics/resolve";
import { revenuePerCall, toClosingTotals, toFunnelTotals } from "@/lib/monthly-metrics/rates";
import type { MonthlySalesSummary } from "@/lib/sales/queries";
import { computeFunnelRates, formatPercent } from "@/lib/setting/funnel";
import type { AcquisitionFunnelStep } from "@/lib/acquisition-funnels/types";
import type { ScaleScoreTarget } from "@/lib/diagnostic/scale-score";

import { saveMonthlyMetrics } from "./actions";

function callsSource(source: MonthlyCallSource, text: string, linkLabel: string): KpiFieldSource {
  return {
    text,
    href: "/ventes/appels",
    linkLabel,
  };
}

function salesSource(text: string, linkLabel: string): KpiFieldSource {
  return { text, href: "/ventes/suivi", linkLabel };
}

function stripeSource(syncedAt: Date | null, locale: string, text: string, linkLabel: string): KpiFieldSource {
  return {
    text: syncedAt ? `${text} ${new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(syncedAt)}.` : `${text}.`,
    href: "/integrations",
    linkLabel,
  };
}

function toDraft(row: MonthlyMetricsRow | null): MonthlyMetricsInput {
  return {
    cashCollected: row?.cashCollected ?? null,
    cashContracted: row?.cashContracted ?? null,
    newFollowers: row?.newFollowers ?? null,
    firstMessages: row?.firstMessages ?? null,
    conversations: row?.conversations ?? null,
    callsProposed: row?.callsProposed ?? null,
    callsBooked: row?.callsBooked ?? null,
    callsTaken: row?.callsTaken ?? null,
    salesClosed: row?.salesClosed ?? null,
    acquisitionMetrics: row?.acquisitionMetrics ?? {},
    acquisitionSourceMetrics: row?.acquisitionSourceMetrics ?? {},
  };
}

function sameDraft(a: MonthlyMetricsInput, b: MonthlyMetricsInput): boolean {
  return (Object.keys(a) as (keyof MonthlyMetricsInput)[]).every((key) => a[key] === b[key]);
}

// Never auto-fills — always a dismissible suggestion the user applies by
// clicking, per CLAUDE.md's rule against Contenu/Suivi des ventes silently
// overwriting Datas numbers. (Doesn't apply to Setting/Closing daily entries
// below — those measure the exact same field, not an independent estimate
// from another module, so KpiNumberField's disabledReason auto-fills instead.)
function SuggestionBanner({ text, actionLabel, onApply }: { text: string; actionLabel: string; onApply: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-accent-border bg-accent-soft px-3 py-2 text-xs text-accent-text">
      <span>{text}</span>
      <button type="button" onClick={onApply} className="font-bold underline underline-offset-2">
        {actionLabel}
      </button>
    </div>
  );
}

type PendingAction = null | "close" | { type: "navigate"; delta: number };
type MonthlyScaleScoreTarget = Extract<ScaleScoreTarget, "month" | "acquisition">;
type ScaleScoreFieldCandidate = {
  key: string;
  label: string;
  value: number | null;
  section: "finance" | "acquisition" | "closing";
  disabled: boolean;
};

export function MonthModal({
  year,
  month,
  initialData,
  monthRowsThisYear,
  postLeadsThisMonth,
  salesThisMonth,
  pipelineVolumesThisMonth,
  allSettingEntries,
  allClosingEntries,
  callSource = null,
  callTrackingConnected,
  activeMetricFields,
  scaleScoreTarget = null,
  onClose,
  onNavigate,
}: {
  year: number;
  month: number;
  initialData: MonthlyMetricsRow | null;
  monthRowsThisYear: MonthlyMetricsRow[];
  postLeadsThisMonth: number;
  salesThisMonth: MonthlySalesSummary | undefined;
  pipelineVolumesThisMonth: { conversations: number; callsBooked: number; callsTaken: number } | undefined;
  allSettingEntries: (typeof settingKpiEntries.$inferSelect)[];
  allClosingEntries: (typeof closingKpiEntries.$inferSelect)[];
  callSource?: MonthlyCallSource | null;
  callTrackingConnected: boolean;
  activeMetricFields: AcquisitionFunnelStep[];
  scaleScoreTarget?: MonthlyScaleScoreTarget | null;
  onClose: () => void;
  onNavigate: (nextYear: number, nextMonth: number) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("data.modal");
  const router = useRouter();
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, { month: "long", timeZone: "UTC" });
  const settingSource: KpiFieldSource = { text: t("settingSource"), href: "/ventes/pipeline/funnel", linkLabel: t("dailyTracking") };
  const closingDailySource: KpiFieldSource = { text: t("closingSource"), href: "/ventes/appels", linkLabel: t("callTracking") };
  const persistedSettingManualOverride = initialData?.settingManualOverride ?? false;
  const persistedClosingManualOverride = initialData?.closingManualOverride ?? false;
  const persistedSourceOverrides = useMemo(
    () => ({
      settingManualOverride: persistedSettingManualOverride,
      closingManualOverride: persistedClosingManualOverride,
    }),
    [persistedSettingManualOverride, persistedClosingManualOverride]
  );
  const [sourceOverrides, setSourceOverrides] = useState(persistedSourceOverrides);
  const [sourceEditMode, setSourceEditMode] = useState({
    setting: persistedSettingManualOverride,
    closing: persistedClosingManualOverride,
  });
  // Recomputed on every month navigation (no server round-trip) — same
  // pattern as monthRowsThisYear, which is also sliced client-side already.
  const dailySourceOverlay = useMemo(
    () => resolveDailySourceOverlay(monthDateRange(year, month), allSettingEntries, allClosingEntries, sourceOverrides, callSource, {
      callTrackingConnected,
      salesClosed: salesThisMonth?.closedCount,
    }),
    [year, month, allSettingEntries, allClosingEntries, sourceOverrides, callSource, callTrackingConnected, salesThisMonth]
  );
  const { settingSourced, callsBookedSourced, callsTakenSourced, salesClosedSourced, closingSourced } = dailySourceOverlay;
  const activeInputKeys = useMemo(() => new Set(activeMetricFields.map((field) => field.inputMetricKey)), [activeMetricFields]);
  const hasSettingMetrics = ["new_followers", "first_messages", "conversations", "calls_proposed", "calls_booked"].some((key) => activeInputKeys.has(key));
  const customMetricFields = useMemo(
    () => Array.from(new Map(activeMetricFields.filter((field) => !["new_followers", "first_messages", "conversations", "calls_proposed", "calls_booked", "calls_attended", "sales_closed"].includes(field.inputMetricKey)).map((field) => [field.inputMetricKey, field] as const)).values()),
    [activeMetricFields]
  );
  const callSourceForCopy = callSource ?? { callsBooked: 0, callsTaken: 0, salesClosed: 0, callCount: 0 };
  const callTrackingFieldSource = callsSource(
    callSourceForCopy,
    t("callTrackingSource", {
      booked: callSourceForCopy.callsBooked,
      bookedPlural: callSourceForCopy.callsBooked > 1 ? "s" : "",
      attended: callSourceForCopy.callsTaken,
      attendedPlural: callSourceForCopy.callsTaken > 1 ? "s" : "",
      closed: callSourceForCopy.salesClosed,
      closedPlural: callSourceForCopy.salesClosed > 1 ? "s" : "",
    }),
    t("callTrackingLink")
  );
  const salesLedgerFieldSource = salesSource(
    t("salesSource", { count: salesThisMonth?.closedCount ?? 0, plural: (salesThisMonth?.closedCount ?? 0) > 1 ? "s" : "" }),
    t("salesSourceLink")
  );
  const settingCallsBookedSource = callsBookedSourced ? callTrackingFieldSource : settingSource;
  const callsTakenFieldSource = callsTakenSourced ? callTrackingFieldSource : dailySourceOverlay.closingSource === "daily" && !sourceEditMode.closing ? closingDailySource : undefined;
  const salesClosedFieldSource = salesClosedSourced
    ? salesThisMonth !== undefined
      ? salesLedgerFieldSource
      : dailySourceOverlay.closingSource === "calls"
        ? callTrackingFieldSource
        : dailySourceOverlay.closingSource === "daily" && !sourceEditMode.closing
          ? closingDailySource
          : undefined
    : undefined;
  const closingExternallySourced = callsTakenSourced || dailySourceOverlay.closingSource === "calls" || dailySourceOverlay.closingSource === "sales";
  const initial = { ...toDraft(initialData), ...dailySourceOverlay.overrides };
  const cashCollectedSynced = initialData?.cashCollectedSource === "stripe";
  const cashCollectedStale = initialData?.cashCollectedSource === "stripe_stale";
  const bankTransferCustomers = salesThisMonth?.bankTransferCustomers ?? 0;
  const stripeNewCustomers = initialData?.newCustomersSource === "stripe" || initialData?.newCustomersSource === "stripe_stale"
    ? initialData.newCustomers
    : null;
  const resolvedNewCustomers = resolveMonthNewCustomers(initialData, bankTransferCustomers);
  const newCustomersFieldSource: KpiFieldSource | undefined = resolvedNewCustomers.amount === null
    ? undefined
    : stripeNewCustomers !== null && bankTransferCustomers > 0
      ? {
          text: t("newCustomersCombinedSource", {
            stripeCount: stripeNewCustomers,
            stripePlural: stripeNewCustomers > 1 ? "s" : "",
            salesCount: bankTransferCustomers,
            salesPlural: bankTransferCustomers > 1 ? "s" : "",
          }),
          href: "/ventes/suivi",
          linkLabel: t("salesSourceLink"),
        }
      : stripeNewCustomers !== null
        ? {
          text: t("newCustomersStripeSource", {
              count: stripeNewCustomers,
              plural: stripeNewCustomers > 1 ? "s" : "",
            }),
            href: "/integrations",
            linkLabel: t("viewIntegrations"),
          }
        : {
            text: t("newCustomersSalesSource", { count: bankTransferCustomers, plural: bankTransferCustomers > 1 ? "s" : "" }),
            href: "/ventes/suivi",
            linkLabel: t("salesSourceLink"),
          };
  const [draft, setDraft] = useState<MonthlyMetricsInput>(initial);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<"import" | "manual">(scaleScoreTarget || initialData ? "manual" : "import");
  const [importAppliedCount, setImportAppliedCount] = useState<number | null>(null);
  const [importUsage, setImportUsage] = useState<MonthlyKpiImportUsage | null>(null);
  const [isPending, startTransition] = useTransition();

  const scaleScoreFieldCandidates: ScaleScoreFieldCandidate[] = [
    {
      key: "cashCollected",
      label: t("cashCollected"),
      value: draft.cashCollected,
      section: "finance",
      disabled: cashCollectedSynced,
    },
    {
      key: "cashContracted",
      label: t("cashContracted"),
      value: draft.cashContracted,
      section: "finance",
      disabled: false,
    },
    ...(activeInputKeys.has("new_followers")
      ? [{ key: "newFollowers", label: t("newFollowers"), value: draft.newFollowers, section: "acquisition" as const, disabled: settingSourced && !sourceEditMode.setting }]
      : []),
    ...(activeInputKeys.has("first_messages")
      ? [{ key: "firstMessages", label: t("firstMessages"), value: draft.firstMessages, section: "acquisition" as const, disabled: settingSourced && !sourceEditMode.setting }]
      : []),
    ...(activeInputKeys.has("conversations")
      ? [{ key: "conversations", label: t("conversations"), value: draft.conversations, section: "acquisition" as const, disabled: settingSourced && !sourceEditMode.setting }]
      : []),
    ...(activeInputKeys.has("calls_proposed")
      ? [{ key: "callsProposed", label: t("callsProposed"), value: draft.callsProposed, section: "acquisition" as const, disabled: settingSourced && !sourceEditMode.setting }]
      : []),
    ...(activeInputKeys.has("calls_booked")
      ? [{ key: "callsBooked", label: t("callsBooked"), value: draft.callsBooked, section: "acquisition" as const, disabled: callsBookedSourced || (settingSourced && !sourceEditMode.setting) }]
      : []),
    ...customMetricFields.map((field) => ({
      key: field.inputMetricKey,
      label: `${field.label} (${field.unit})`,
      value: draft.acquisitionMetrics?.[field.inputMetricKey] ?? null,
      section: "acquisition" as const,
      disabled: false,
    })),
    ...(activeInputKeys.has("calls_attended")
      ? [{ key: "callsTaken", label: t("callsTaken"), value: draft.callsTaken, section: "closing" as const, disabled: callsTakenFieldSource !== undefined }]
      : []),
    ...(activeInputKeys.has("sales_closed")
      ? [{ key: "salesClosed", label: t("salesClosed"), value: draft.salesClosed, section: "closing" as const, disabled: salesClosedFieldSource !== undefined }]
      : []),
  ];
  const missingScaleScoreField = (candidates: ScaleScoreFieldCandidate[]) =>
    candidates.find((field) => field.value === null && !field.disabled) ?? null;
  const targetCandidates = scaleScoreTarget === "month"
    ? scaleScoreFieldCandidates
    : scaleScoreFieldCandidates.filter((field) => field.section === scaleScoreTarget);
  const fallbackCandidates = scaleScoreTarget === "acquisition" && targetCandidates.length === 0
    ? scaleScoreFieldCandidates.filter((field) => field.section === "closing")
    : [];
  const scaleScoreTargetField = scaleScoreTarget
    ? missingScaleScoreField(targetCandidates.length > 0 ? targetCandidates : fallbackCandidates)
    : null;
  const scaleScoreTargetFieldKey = scaleScoreTargetField?.key ?? null;

  useEffect(() => {
    const persistedOverlay = resolveDailySourceOverlay(monthDateRange(year, month), allSettingEntries, allClosingEntries, persistedSourceOverrides, callSource, {
      callTrackingConnected,
      salesClosed: salesThisMonth?.closedCount,
    });
    setSourceOverrides(persistedSourceOverrides);
    setSourceEditMode({
      setting: persistedSourceOverrides.settingManualOverride,
      closing: persistedSourceOverrides.closingManualOverride,
    });
    setDraft({ ...toDraft(initialData), ...persistedOverlay.overrides });
    setImportAppliedCount(null);
    setImportUsage(null);
    setEntryMode(scaleScoreTarget || initialData ? "manual" : "import");
  }, [year, month, initialData, allSettingEntries, allClosingEntries, persistedSourceOverrides, callSource, callTrackingConnected, salesThisMonth, scaleScoreTarget]);

  const isDirty =
    !sameDraft(draft, initial) ||
    sourceOverrides.settingManualOverride !== persistedSourceOverrides.settingManualOverride ||
    sourceOverrides.closingManualOverride !== persistedSourceOverrides.closingManualOverride;

  function update(patch: Partial<MonthlyMetricsInput>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function setSectionOverride(section: "setting" | "closing", enabled: boolean) {
    const next = {
      ...sourceOverrides,
      ...(section === "setting" ? { settingManualOverride: enabled } : { closingManualOverride: enabled }),
    };
    setSourceOverrides(next);
    setSourceEditMode((current) => ({
      ...current,
      ...(section === "setting" ? { setting: enabled } : { closing: enabled }),
    }));

    if (!enabled) {
      const dailyValues = resolveDailySourceOverlay(monthDateRange(year, month), allSettingEntries, allClosingEntries, {
        settingManualOverride: false,
        closingManualOverride: false,
      }, callSource, {
        callTrackingConnected,
        salesClosed: salesThisMonth?.closedCount,
      }).overrides;
      const fields = section === "setting" ? SETTING_FIELDS : CLOSING_FIELDS;
      const patch = Object.fromEntries(fields.map((field) => [field, dailyValues[field] ?? null])) as Partial<MonthlyMetricsInput>;
      update(patch);
    }
  }

  function updateSourceField(section: "setting" | "closing", field: keyof MonthlyMetricsInput, value: number | null) {
    const sourceValue = dailySourceOverlay.overrides[field] ?? null;
    const externallySourced = field === "callsBooked"
      ? callsBookedSourced
      : field === "callsTaken"
        ? callsTakenSourced
        : field === "salesClosed"
          ? salesClosedSourced
          : false;
    if (!externallySourced && value !== sourceValue) {
      setSourceOverrides((current) => ({
        ...current,
        ...(section === "setting" ? { settingManualOverride: true } : { closingManualOverride: true }),
      }));
    }
    update({ [field]: value });
  }

  function adjacentMonth(delta: number): { year: number; month: number } {
    const nextMonth = month + delta;
    const nextYear = nextMonth < 1 ? year - 1 : nextMonth > 12 ? year + 1 : year;
    return { year: nextYear, month: ((nextMonth - 1 + 12) % 12) + 1 };
  }

  function requestClose() {
    if (isDirty) {
      setPendingAction("close");
    } else {
      onClose();
    }
  }

  function requestNavigate(delta: number) {
    if (isDirty) {
      setPendingAction({ type: "navigate", delta });
    } else {
      const next = adjacentMonth(delta);
      onNavigate(next.year, next.month);
    }
  }

  function handleSave(after?: () => void) {
    const nextSourceOverrides = { ...sourceOverrides };
    if (settingSourced && sourceEditMode.setting && SETTING_FIELDS.some((field) => {
      if (field === "callsBooked" && callsBookedSourced) return false;
      return draft[field] !== (dailySourceOverlay.overrides[field] ?? null);
    })) {
      nextSourceOverrides.settingManualOverride = true;
    }
    if (closingSourced && sourceEditMode.closing && CLOSING_FIELDS.some((field) => {
      if (field === "callsTaken" && callsTakenSourced) return false;
      if (field === "salesClosed" && salesClosedSourced) return false;
      return draft[field] !== (dailySourceOverlay.overrides[field] ?? null);
    })) {
      nextSourceOverrides.closingManualOverride = true;
    }
    setSourceOverrides(nextSourceOverrides);
    startTransition(async () => {
      const saveOverlay = resolveDailySourceOverlay(monthDateRange(year, month), allSettingEntries, allClosingEntries, nextSourceOverrides, callSource, {
        callTrackingConnected,
        salesClosed: salesThisMonth?.closedCount,
      });
      const payload = stripDailySourcedFields(draft, saveOverlay);
      const result = await saveMonthlyMetrics(year, month, payload, importUsage ?? undefined, nextSourceOverrides);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      setSaveError(null);
      setImportAppliedCount(null);
      setImportUsage(null);
      router.refresh();
      if (after) after();
      else onClose();
    });
  }

  function discardAndProceed() {
    if (pendingAction === "close") onClose();
    else if (pendingAction?.type === "navigate") {
      const next = adjacentMonth(pendingAction.delta);
      onNavigate(next.year, next.month);
    }
    setPendingAction(null);
  }

  function saveAndProceed() {
    handleSave(() => {
      if (pendingAction === "close") onClose();
      else if (pendingAction?.type === "navigate") {
        const next = adjacentMonth(pendingAction.delta);
        onNavigate(next.year, next.month);
      }
      setPendingAction(null);
    });
  }

  const cumulCollected = monthRowsThisYear
    .filter((row) => row.month <= month)
    .reduce((sum, row) => sum + (row.month === month ? (draft.cashCollected ?? 0) : (row.cashCollected ?? 0)), 0);
  const previousMonthRow = monthRowsThisYear.find((row) => row.month === month - 1) ?? null;
  const previousCollected = resolveMonthCashCollected(previousMonthRow).amount;
  const comparisonEvolution = draft.cashCollected === null || previousCollected === null
    ? null
    : previousCollected === 0
      ? draft.cashCollected === 0 ? 0 : null
      : Math.round(((draft.cashCollected - previousCollected) / Math.abs(previousCollected)) * 100);

  const settingRates = computeFunnelRates(toFunnelTotals(draft));
  const closingRates = computeClosingRates(toClosingTotals(draft), draft.callsBooked ?? 0);
  const perCall = revenuePerCall(draft.cashContracted, draft.callsTaken);

  const callsTakenWarning =
    draft.callsTaken !== null && draft.callsBooked !== null && draft.callsTaken > draft.callsBooked
      ? t("checkNumber")
      : undefined;
  const salesClosedWarning =
    draft.salesClosed !== null && draft.callsTaken !== null && draft.salesClosed > draft.callsTaken
      ? t("checkNumber")
      : undefined;

  const sourceImportFields = useMemo(() => {
    const settingFields = SETTING_FIELDS.filter((field) => activeInputKeys.has(field === "newFollowers" ? "new_followers" : field === "firstMessages" ? "first_messages" : field === "conversations" ? "conversations" : field === "callsProposed" ? "calls_proposed" : "calls_booked"));
    const closingFields = CLOSING_FIELDS.filter((field) => activeInputKeys.has(field === "callsTaken" ? "calls_attended" : "sales_closed"));
    const fields = [
      ...(settingSourced ? settingFields : []),
      ...(callsBookedSourced && activeInputKeys.has("calls_booked") ? ["callsBooked" as const] : []),
      ...(closingSourced
        ? closingFields.filter((field) => field === "callsTaken" ? callsTakenSourced : salesClosedSourced)
        : []),
    ];
    return fields;
  }, [activeInputKeys, callsBookedSourced, callsTakenSourced, closingSourced, salesClosedSourced, settingSourced]);
  const nonOverridableImportFields = useMemo(() => (cashCollectedSynced ? (["cashCollected"] as const) : []), [cashCollectedSynced]);

  return (
    <Dialog open onOpenChange={(next) => !next && requestClose()}>
      <DialogContent className="max-w-2xl p-0">
        {pendingAction ? (
          <div className="flex flex-col gap-4 p-2 text-center">
            <p className="font-bold">{t("unsavedChanges")}</p>
            <div className="flex justify-center gap-3">
              <Button onClick={saveAndProceed} disabled={isPending}>
                {t("save")}
              </Button>
              <Button variant="outline" onClick={discardAndProceed}>
                {t("discard")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 px-6 pt-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent-text">
                  <WalletCards className="size-5" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={() => requestNavigate(-1)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                  aria-label={t("previousMonth")}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <DialogTitle className="font-display text-lg font-bold">
                  {monthLabel} {year}
                </DialogTitle>
                <button
                  type="button"
                  onClick={() => requestNavigate(1)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                  aria-label={t("nextMonth")}
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={requestClose}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                aria-label={t("close")}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="px-6 pt-4">
              <p className="text-sm text-muted-foreground">
                {t("intro", { month: monthLabel })}
              </p>
              {scaleScoreTarget && (
                <div role="status" className="mt-3 rounded-[var(--radius-control)] border border-accent-border bg-accent-soft px-3 py-2 text-xs font-bold text-accent-text">
                  {scaleScoreTargetField
                    ? t("scaleScoreTargetNotice", { field: scaleScoreTargetField.label })
                    : t("scaleScoreSectionNotice")}
                </div>
              )}
            </div>

            <section className="mx-6 mt-4 rounded-[var(--radius-card)] border border-border bg-muted/40 p-4" aria-labelledby="month-comparison-title">
              <p id="month-comparison-title" className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("comparisonTitle")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("currentValue")}</p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">{draft.cashCollected === null ? t("notAvailable") : formatEur(draft.cashCollected, locale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("previousValue")}</p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">{previousCollected === null ? t("notAvailable") : formatEur(previousCollected, locale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("yearTotal")}</p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">{formatEur(cumulCollected, locale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("evolution")}</p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums">
                    {comparisonEvolution === null ? t("notAvailable") : comparisonEvolution === 0 ? t("noChange") : `${comparisonEvolution > 0 ? "+" : ""}${comparisonEvolution}%`}
                  </p>
                </div>
              </div>
            </section>

            <div className="mx-6 mt-5 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunken p-1" role="tablist" aria-label={t("inputMethod")}>
              <button
                type="button"
                role="tab"
                aria-selected={entryMode === "import"}
                onClick={() => setEntryMode("import")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent-2 ${
                  entryMode === "import" ? "bg-card text-accent-2-text shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {t("smartImport")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={entryMode === "manual"}
                onClick={() => setEntryMode("manual")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  entryMode === "manual" ? "bg-card text-accent-text shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <PencilLine className="size-4" aria-hidden="true" />
                {t("manualEntry")}
              </button>
            </div>

            {entryMode === "import" ? (
              <div className="flex flex-col gap-4 px-6 py-5">
                <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-accent-2-border bg-accent-2-soft/60 p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-2 text-white shadow-[0_4px_12px_var(--accent-2-glow)]">
                    <Sparkles className="size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-accent-2-text">{t("falcoTitle")}</p>
                    <p className="mt-1 text-xs leading-5 text-accent-2-text/80">
                      {t("falcoHelp")}
                    </p>
                  </div>
                </div>
                <MonthlyKpiImport
                  period={{ year, month }}
                  sourceManagedFields={sourceImportFields}
                  nonOverridableFields={nonOverridableImportFields}
                  onApply={(values, count, usage) => {
                    const sourceManaged = new Set<string>([
                      ...(callsBookedSourced ? ["callsBooked"] : []),
                      ...(callsTakenSourced ? ["callsTaken"] : []),
                      ...(salesClosedSourced ? ["salesClosed"] : []),
                    ]);
                    const safeValues = Object.fromEntries(Object.entries(values).filter(([field]) => !sourceManaged.has(field))) as Partial<MonthlyMetricsInput>;
                    const nextOverrides = { ...sourceOverrides };
                    if (
                      settingSourced &&
                      SETTING_FIELDS.some((field) => field !== "callsBooked" && values[field] !== undefined && values[field] !== dailySourceOverlay.overrides[field])
                    ) {
                      nextOverrides.settingManualOverride = true;
                    }
                    if (
                      closingSourced &&
                      CLOSING_FIELDS.some((field) => !sourceManaged.has(field) && values[field] !== undefined && values[field] !== dailySourceOverlay.overrides[field])
                    ) {
                      nextOverrides.closingManualOverride = true;
                    }
                    setSourceOverrides(nextOverrides);
                    setSourceEditMode((current) => ({
                      setting: current.setting || settingSourced || callsBookedSourced,
                      closing: current.closing || closingSourced,
                    }));
                    update(safeValues);
                    setImportAppliedCount(count);
                    setImportUsage(usage ?? null);
                    setEntryMode("manual");
                  }}
                />
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-6 px-6 pb-6">
              {importAppliedCount !== null && (
                <div className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft/60 px-3 py-3" role="status">
                  <div>
                    <p className="text-sm font-bold text-accent-2-text">{t("valuesReady", { count: importAppliedCount, plural: importAppliedCount > 1 ? "s" : "" })}</p>
                    <p className="mt-1 text-xs text-accent-2-text/80">{t("valuesReadyHelp")}</p>
                  </div>
                  <button type="button" onClick={() => setEntryMode("import")} className="shrink-0 text-xs font-bold text-accent-2-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-2">
                    {t("review")}
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <WalletCards className="size-4" aria-hidden="true" />
                  {t("finance")}
                </p>
                {cashCollectedStale && (
                  <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-xs font-bold text-state-caution">
                    {t("stripeStale", { date: initialData?.cashCollectedSyncedAt ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(initialData.cashCollectedSyncedAt) : "?" })}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiNumberField
                    label={t("cashCollected")}
                    value={draft.cashCollected}
                    onChange={(v) => update({ cashCollected: v })}
                    disabledReason={cashCollectedSynced ? stripeSource(initialData?.cashCollectedSyncedAt ?? null, locale, t("stripeSynced"), t("viewIntegrations")) : undefined}
                    highlight={scaleScoreTargetFieldKey === "cashCollected"}
                  />
                  <KpiNumberField
                    label={t("cashContracted")}
                    value={draft.cashContracted}
                    onChange={(v) => update({ cashContracted: v })}
                    highlight={scaleScoreTargetFieldKey === "cashContracted"}
                  />
                  {newCustomersFieldSource && (
                    <KpiNumberField
                      label={t("newCustomers")}
                      value={resolvedNewCustomers.amount}
                      onChange={() => {}}
                      disabledReason={newCustomersFieldSource}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("yearToDate", { amount: formatEur(cumulCollected, locale) })}
                </p>
                {salesThisMonth && salesThisMonth.contracted > 0 && salesThisMonth.contracted !== draft.cashContracted && (
                  <SuggestionBanner
                    text={t("salesSuggestion", { contracted: formatEur(salesThisMonth.contracted, locale), collected: formatEur(salesThisMonth.collected, locale) })}
                    actionLabel={t("useValue")}
                    onApply={() =>
                      update({ cashContracted: salesThisMonth.contracted, cashCollected: salesThisMonth.collected })
                    }
                  />
                )}
              </div>

              {hasSettingMetrics ? <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <Send className="size-4" aria-hidden="true" />
                  {t("settingProspecting")}
                </p>
                {(settingSourced || callsBookedSourced) && !sourceEditMode.setting && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution-bg px-3 py-2 text-xs text-state-caution">
                    <span>{t("settingCalculated")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSectionOverride("setting", true)}>
                      {t("editMonth")}
                    </Button>
                  </div>
                )}
                {settingSourced && sourceEditMode.setting && !sourceOverrides.settingManualOverride && (
                  <p className="rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution-bg px-3 py-2 text-xs text-state-caution">
                    {t("overrideHint")}
                  </p>
                )}
                {sourceOverrides.settingManualOverride && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft/60 px-3 py-2 text-xs text-accent-2-text">
                    <span>{t("overrideActive")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSectionOverride("setting", false)}>
                      {t("backToDaily")}
                    </Button>
                  </div>
                )}
                {activeInputKeys.has("new_followers") || activeInputKeys.has("first_messages") || activeInputKeys.has("conversations") || activeInputKeys.has("calls_proposed") || activeInputKeys.has("calls_booked") ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {activeInputKeys.has("new_followers") && <KpiNumberField label={t("newFollowers")} value={draft.newFollowers} onChange={(v) => updateSourceField("setting", "newFollowers", v)} disabledReason={settingSourced && !sourceEditMode.setting ? settingSource : undefined} highlight={scaleScoreTargetFieldKey === "newFollowers"} />}
                    {activeInputKeys.has("first_messages") && <KpiNumberField label={t("firstMessages")} value={draft.firstMessages} onChange={(v) => updateSourceField("setting", "firstMessages", v)} disabledReason={settingSourced && !sourceEditMode.setting ? settingSource : undefined} highlight={scaleScoreTargetFieldKey === "firstMessages"} />}
                    {activeInputKeys.has("conversations") && <KpiNumberField label={t("conversations")} value={draft.conversations} onChange={(v) => updateSourceField("setting", "conversations", v)} disabledReason={settingSourced && !sourceEditMode.setting ? settingSource : undefined} highlight={scaleScoreTargetFieldKey === "conversations"} />}
                    {activeInputKeys.has("calls_proposed") && <KpiNumberField label={t("callsProposed")} value={draft.callsProposed} onChange={(v) => updateSourceField("setting", "callsProposed", v)} disabledReason={settingSourced && !sourceEditMode.setting ? settingSource : undefined} highlight={scaleScoreTargetFieldKey === "callsProposed"} />}
                    {activeInputKeys.has("calls_booked") && <KpiNumberField label={t("callsBooked")} value={draft.callsBooked} onChange={(v) => updateSourceField("setting", "callsBooked", v)} disabledReason={callsBookedSourced ? settingCallsBookedSource : settingSourced && !sourceEditMode.setting ? settingSource : undefined} highlight={scaleScoreTargetFieldKey === "callsBooked"} />}
                  </div>
                ) : null}
                {customMetricFields.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {customMetricFields.map((field) => (
                      <KpiNumberField
                        key={field.inputMetricKey}
                        label={`${field.label} (${field.unit})`}
                        value={draft.acquisitionMetrics?.[field.inputMetricKey] ?? null}
                        onChange={(value) => update({ acquisitionMetrics: { ...(draft.acquisitionMetrics ?? {}), [field.inputMetricKey]: value } })}
                        highlight={scaleScoreTargetFieldKey === field.inputMetricKey}
                      />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t("responseRate")}:{" "}
                    {settingRates.responseRate === null ? "—" : formatPercent(settingRates.responseRate, locale)}
                  </span>
                  <span>
                    {t("proposalRate")}:{" "}
                    {settingRates.proposalRate === null ? "—" : formatPercent(settingRates.proposalRate, locale)}
                  </span>
                  <span>
                    {t("bookingRate")}:{" "}
                    {settingRates.bookingRate === null ? "—" : formatPercent(settingRates.bookingRate, locale)}
                  </span>
                </div>
                {!settingSourced && postLeadsThisMonth > 0 && postLeadsThisMonth !== draft.newFollowers && (
                  <SuggestionBanner
                    text={t("contentSuggestion", { count: postLeadsThisMonth })}
                    actionLabel={t("useValue")}
                    onApply={() => update({ newFollowers: postLeadsThisMonth })}
                  />
                )}
                {!settingSourced &&
                  pipelineVolumesThisMonth &&
                  pipelineVolumesThisMonth.conversations > 0 &&
                  pipelineVolumesThisMonth.conversations !== draft.conversations && (
                    <SuggestionBanner
                      text={t("pipelineConversationsSuggestion", { count: pipelineVolumesThisMonth.conversations, plural: pipelineVolumesThisMonth.conversations > 1 ? "s" : "" })}
                      actionLabel={t("useValue")}
                      onApply={() => update({ conversations: pipelineVolumesThisMonth.conversations })}
                    />
                  )}
                {!settingSourced &&
                  pipelineVolumesThisMonth &&
                  pipelineVolumesThisMonth.callsBooked > 0 &&
                  pipelineVolumesThisMonth.callsBooked !== draft.callsBooked && (
                    <SuggestionBanner
                      text={t("pipelineBookedSuggestion", { count: pipelineVolumesThisMonth.callsBooked, plural: pipelineVolumesThisMonth.callsBooked > 1 ? "s" : "" })}
                      actionLabel={t("useValue")}
                      onApply={() => update({ callsBooked: pipelineVolumesThisMonth.callsBooked })}
                    />
                  )}
              </div> : null}

              {activeInputKeys.has("calls_attended") || activeInputKeys.has("sales_closed") ? <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <Phone className="size-4" aria-hidden="true" />
                  {t("closing")}
                </p>
                {closingSourced && !sourceEditMode.closing && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution-bg px-3 py-2 text-xs text-state-caution">
                    <span>{closingExternallySourced ? t("closingConnected") : t("closingCalculated")}</span>
                    {!closingExternallySourced && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setSectionOverride("closing", true)}>
                        {t("editMonth")}
                      </Button>
                    )}
                  </div>
                )}
                {closingSourced && sourceEditMode.closing && !sourceOverrides.closingManualOverride && !closingExternallySourced && (
                  <p className="rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution-bg px-3 py-2 text-xs text-state-caution">
                    {t("overrideHint")}
                  </p>
                )}
                {sourceOverrides.closingManualOverride && !closingExternallySourced && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft/60 px-3 py-2 text-xs text-accent-2-text">
                    <span>{t("overrideActive")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSectionOverride("closing", false)}>
                      {t("backToDaily")}
                    </Button>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeInputKeys.has("calls_attended") && <KpiNumberField label={t("callsTaken")} value={draft.callsTaken} onChange={(v) => updateSourceField("closing", "callsTaken", v)} warning={callsTakenWarning} disabledReason={callsTakenSourced ? callTrackingFieldSource : callsTakenFieldSource} highlight={scaleScoreTargetFieldKey === "callsTaken"} />}
                  {activeInputKeys.has("sales_closed") && <KpiNumberField label={t("salesClosed")} value={draft.salesClosed} onChange={(v) => updateSourceField("closing", "salesClosed", v)} warning={salesClosedWarning} disabledReason={salesClosedFieldSource} highlight={scaleScoreTargetFieldKey === "salesClosed"} />}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t("showUpRate")}:{" "}
                    {closingRates.showUpRate === null ? "—" : formatPercent(closingRates.showUpRate, locale)}
                  </span>
                  <span>
                    {t("noShowRate")}:{" "}
                    {closingRates.noShowRate === null ? "—" : formatPercent(closingRates.noShowRate, locale)}
                  </span>
                  <span>
                    {t("closingRate")}:{" "}
                    {closingRates.closingRate === null ? "—" : formatPercent(closingRates.closingRate, locale)}
                  </span>
                  <span>{t("revenuePerCall", { amount: perCall === null ? "—" : formatEur(perCall, locale) })}</span>
                </div>
                {!closingSourced && salesThisMonth && salesThisMonth.closedCount > 0 && salesThisMonth.closedCount !== draft.salesClosed && (
                  <SuggestionBanner
                    text={t("salesClosedSuggestion", { count: salesThisMonth.closedCount, plural: salesThisMonth.closedCount > 1 ? "s" : "" })}
                    actionLabel={t("useValue")}
                    onApply={() => update({ salesClosed: salesThisMonth.closedCount })}
                  />
                )}
                {!closingSourced &&
                  pipelineVolumesThisMonth &&
                  pipelineVolumesThisMonth.callsTaken > 0 &&
                  pipelineVolumesThisMonth.callsTaken !== draft.callsTaken && (
                    <SuggestionBanner
                      text={t("pipelineTakenSuggestion", { count: pipelineVolumesThisMonth.callsTaken, plural: pipelineVolumesThisMonth.callsTaken > 1 ? "s" : "" })}
                      actionLabel={t("useValue")}
                      onApply={() => update({ callsTaken: pipelineVolumesThisMonth.callsTaken })}
                    />
                  )}
              </div> : null}

              {saveError && <p className="text-sm text-state-critical">{saveError}</p>}

              <div className="flex items-center justify-between gap-4">
                <Button onClick={() => handleSave()} disabled={isPending}>
                  {isPending ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
