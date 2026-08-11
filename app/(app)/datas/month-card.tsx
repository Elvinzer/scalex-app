import { computeCompletion, monthStatus } from "@/lib/monthly-metrics/completion";
import { EMPTY_MONTHLY_METRICS } from "@/lib/monthly-metrics/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import type { AcquisitionFunnelStep } from "@/lib/acquisition-funnels/types";
import { monthKey, type MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { monthDateRange } from "@/lib/date-range";
import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { formatEur } from "@/lib/currency";
import { rate, formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

const STATUS_BADGE: Record<string, string> = {
  complete: "bg-state-healthy-bg text-state-healthy",
  partial: "bg-state-caution-bg text-state-caution",
};

export function MonthCard({
  year,
  monthIndex,
  row,
  isCurrent,
  isFuture,
  allSettingEntries,
  allClosingEntries,
  callSourcesByMonth,
  activeMetricFields,
  onOpen,
}: {
  year: number;
  monthIndex: number;
  row: MonthlyMetricsRow | null;
  isCurrent: boolean;
  isFuture: boolean;
  allSettingEntries: (typeof settingKpiEntries.$inferSelect)[];
  allClosingEntries: (typeof closingKpiEntries.$inferSelect)[];
  callSourcesByMonth: Record<string, MonthlyCallSource>;
  activeMetricFields: AcquisitionFunnelStep[];
  onOpen: () => void;
}) {
  const t = useTranslations("data");
  const locale = useLocale();
  const monthLabel = new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString(locale, { month: "long", timeZone: "UTC" });
  // Same merge as MonthModal: fields sourced from daily Setting/Closing
  // entries are shown there pre-filled (greyed, read-only) rather than from
  // the monthly row itself — the completion badge must count them too, or
  // it under-reports "X/9" for months filled via daily check-ins.
  const overlay = resolveDailySourceOverlay(monthDateRange(year, monthIndex), allSettingEntries, allClosingEntries, {
    settingManualOverride: row?.settingManualOverride,
    closingManualOverride: row?.closingManualOverride,
  }, callSourcesByMonth[monthKey(year, monthIndex)] ?? null);
  const data = { ...(row ?? EMPTY_MONTHLY_METRICS), ...overlay.overrides };
  const activeInputKeys = new Set(activeMetricFields.map((field) => field.inputMetricKey));
  const completion = computeCompletion(data, activeInputKeys);
  const status = monthStatus(completion);

  if (isFuture) {
    return (
      <div className="sticker-card-dashed flex flex-col p-5 opacity-40">
        <p className="font-bold">{monthLabel}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("comingSoon")}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "sticker-card flex flex-col p-5 text-left transition-transform hover:-translate-y-0.5",
        // Neutral emphasis for "current month" — coral is reserved for
        // actions, not a locator, so this isn't the brand accent.
        isCurrent && "border-ink"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{monthLabel}</p>
        {status === "complete" && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE.complete)}>
            {t("complete")}
          </span>
        )}
        {status === "partial" && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE.partial)}>
            {completion.count}/{completion.total} {t("entered")}
          </span>
        )}
      </div>

      {status === "empty" && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">{t("noData")}</p>
          <span className="mt-auto pt-3 text-sm font-bold text-foreground">{t("fill")}</span>
        </>
      )}

      {status !== "empty" && (
        <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
          <p className="font-bold text-foreground tabular-nums">
            {data.cashCollected !== null ? formatEur(data.cashCollected, locale) : "—"} {t("collected")}
          </p>
          <p className="tabular-nums">{data.salesClosed !== null ? data.salesClosed : "—"} {t("closedSales")}</p>
          <p className="tabular-nums">
            {(() => {
              const closingRate = rate(data.salesClosed ?? 0, data.callsTaken ?? 0);
              return closingRate === null ? "—" : formatPercent(closingRate, locale);
            })()}{" "}
            {t("closing")}
          </p>
        </div>
      )}
    </button>
  );
}
