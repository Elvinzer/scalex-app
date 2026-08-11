"use client";

import { ChevronLeft, ChevronRight, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Falco } from "@/components/falco/falco";
import { SourceBadge, type MetricSource } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { monthKey, type MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { formatEur } from "@/lib/currency";
import { rate, formatPercent } from "@/lib/setting/funnel";

import { MonthCard } from "./month-card";
import { MonthModal } from "./month-modal";

// ImportFlow pulls exceljs/pdf-parse/papaparse (≈380 Ko gzip combined) —
// it only ever renders inside the Drawer below, closed by default, so a
// static import shipped those in this page's initial JS for nothing.
// ssr: false is correct: never needed for the first server-rendered paint.
const ImportFlow = dynamic(() => import("@/components/import/import-flow").then((m) => m.ImportFlow), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">Chargement…</div>,
});

export function DatasPageClient({
  year,
  monthRows,
  currentYear,
  currentMonth,
  postLeadsByMonth,
  salesByMonth,
  pipelineVolumesByMonth,
  allSettingEntries,
  allClosingEntries,
  callSourcesByMonth,
}: {
  year: number;
  monthRows: MonthlyMetricsRow[];
  currentYear: number;
  currentMonth: number;
  postLeadsByMonth: Record<number, number>;
  salesByMonth: Record<number, { contracted: number; collected: number; closedCount: number }>;
  pipelineVolumesByMonth: Record<number, { conversations: number; callsBooked: number; callsTaken: number }>;
  allSettingEntries: (typeof settingKpiEntries.$inferSelect)[];
  allClosingEntries: (typeof closingKpiEntries.$inferSelect)[];
  callSourcesByMonth: Record<string, MonthlyCallSource>;
}) {
  const t = useTranslations("data");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState<{ year: number; month: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [period, setPeriod] = useState<"current" | "30" | "90" | "year">("year");

  const rowFor = (month: number) => monthRows.find((row) => row.month === month) ?? null;
  const historicalRows = monthRows.filter((row) => row.year < currentYear || (row.year === currentYear && row.month <= currentMonth)).sort((a, b) => b.year - a.year || b.month - a.month);
  const featuredRow = historicalRows.slice(0, period === "90" ? 3 : period === "year" ? 12 : 1)[0] ?? null;
  const featuredYear = featuredRow?.year ?? currentYear;
  const featuredMonth = featuredRow?.month ?? currentMonth;
  const featuredLabel = new Date(Date.UTC(featuredYear, featuredMonth - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const callSource = callSourcesByMonth[monthKey(featuredYear, featuredMonth)] ?? null;
  const hasCallSource = Boolean(callSource && callSource.callCount > 0);
  const settingIsAuthoritative = Boolean(
    featuredRow?.settingManualOverride ||
      (featuredRow && ["newFollowers", "firstMessages", "conversations", "callsProposed", "callsBooked"].some((field) => featuredRow[field as keyof typeof featuredRow] !== null))
  );
  const closingIsAuthoritative = Boolean(
    featuredRow?.closingManualOverride ||
      (featuredRow && ["callsTaken", "salesClosed"].some((field) => featuredRow[field as keyof typeof featuredRow] !== null))
  );
  const featuredSalesSummary = salesByMonth[featuredMonth];
  const featuredCallsBooked = !settingIsAuthoritative && hasCallSource ? callSource.callsBooked : featuredRow?.callsBooked ?? null;
  const featuredCallsTaken = !closingIsAuthoritative && hasCallSource ? callSource.callsTaken : featuredRow?.callsTaken ?? null;
  const featuredSalesClosed = !closingIsAuthoritative
    ? featuredSalesSummary?.closedCount && featuredSalesSummary.closedCount > 0
      ? featuredSalesSummary.closedCount
      : hasCallSource
        ? callSource.salesClosed
        : featuredRow?.salesClosed ?? null
    : featuredRow?.salesClosed ?? null;
  const metricSource = (source: MetricSource): MetricSource => source;
  const featuredClosingRate = featuredSalesClosed !== null && featuredCallsTaken !== null
    ? rate(featuredSalesClosed, featuredCallsTaken)
    : null;
  const metrics: Array<{ label: string; description: string; value: string; evolution: string; source: MetricSource }> = [
    { label: t("metrics.cashCollected"), description: t("metrics.cashCollectedHelp"), value: featuredRow?.cashCollected === null || featuredRow?.cashCollected === undefined ? "—" : formatEur(featuredRow.cashCollected, locale), evolution: t("compare"), source: metricSource(featuredRow?.cashCollectedSource ? "Stripe" : "Saisie") },
    { label: t("metrics.cashContracted"), description: t("metrics.cashContractedHelp"), value: featuredRow?.cashContracted === null || featuredRow?.cashContracted === undefined ? "—" : formatEur(featuredRow.cashContracted, locale), evolution: t("compare"), source: "Saisie" },
    { label: t("metrics.leads"), description: t("metrics.leadsHelp"), value: featuredRow?.newFollowers === null || featuredRow?.newFollowers === undefined ? "—" : String(featuredRow.newFollowers), evolution: t("compare"), source: "Pipeline" },
    { label: t("metrics.conversations"), description: t("metrics.conversationsHelp"), value: featuredRow?.conversations === null || featuredRow?.conversations === undefined ? "—" : String(featuredRow.conversations), evolution: t("compare"), source: "Saisie" },
    { label: t("metrics.callsBooked"), description: t("metrics.callsBookedHelp"), value: featuredCallsBooked === null ? "—" : String(featuredCallsBooked), evolution: t("compare"), source: metricSource(!settingIsAuthoritative && hasCallSource ? "Suivi d'appel" : "Saisie") },
    { label: t("metrics.callsTaken"), description: t("metrics.callsTakenHelp"), value: featuredCallsTaken === null ? "—" : String(featuredCallsTaken), evolution: t("compare"), source: metricSource(!closingIsAuthoritative && hasCallSource ? "Suivi d'appel" : "Saisie") },
    { label: t("metrics.salesClosed"), description: t("metrics.salesClosedHelp"), value: featuredSalesClosed === null ? "—" : String(featuredSalesClosed), evolution: t("compare"), source: metricSource(!closingIsAuthoritative && featuredSalesSummary?.closedCount ? "Stripe + saisie" : hasCallSource ? "Suivi d'appel" : "Saisie") },
    { label: t("metrics.closingRate"), description: t("metrics.closingRateHelp"), value: featuredClosingRate === null ? "—" : formatPercent(featuredClosingRate, locale), evolution: t("compare"), source: "Calculé" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Falco skin="chiffres" skinSizePx={80} priority className="-mt-2" />
          <div>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <Upload className="size-4" />
          {t("import")}
        </Button>
      </div>

      <Drawer open={importOpen} onOpenChange={setImportOpen}>
        <DrawerContent>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <DrawerTitle className="text-base font-bold">{t("importNumbers")}</DrawerTitle>
            <ImportFlow
              source="datas"
              onCommitted={() => {
                router.refresh();
                setImportOpen(false);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <div className="flex items-center justify-center gap-4">
        <Link
          href={`/datas?year=${year - 1}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label={t("previousYear")}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <p className="font-display text-xl font-bold">{year}</p>
        <Link
          href={`/datas?year=${year + 1}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label={t("nextYear")}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label={t("period")}>
        {[
          [t("currentMonth"), "current"],
          [t("days30"), "30"],
          [t("days90"), "90"],
          [t("currentYear"), "year"],
        ].map(([label, value]) => (
          <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value as typeof period)} className={period === value ? "min-h-11 rounded-[var(--radius-control)] border border-accent-border bg-accent-soft px-3 py-2 text-sm font-bold text-accent-text" : "min-h-11 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent"}>
            {label}
          </button>
        ))}
      </div>

      <h2 className="text-base font-bold">{t("monthlyHistory")}</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
          const isFuture = year > currentYear || (year === currentYear && month > currentMonth);
          const isCurrent = year === currentYear && month === currentMonth;
          return (
            <MonthCard
              key={month}
              year={year}
              monthIndex={month}
              row={rowFor(month)}
              isCurrent={isCurrent}
              isFuture={isFuture}
              allSettingEntries={allSettingEntries}
              allClosingEntries={allClosingEntries}
              callSourcesByMonth={callSourcesByMonth}
              onOpen={() => setOpen({ year, month })}
            />
          );
        })}
      </div>

      <section className="overflow-hidden rounded-[var(--radius-card)] border-2 border-border bg-card" aria-labelledby="raw-metrics-title">
        <div className="border-b border-border bg-muted/50 px-5 py-3">
          <h2 id="raw-metrics-title" className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("rawData", { month: featuredLabel })}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              <tr><th className="px-5 py-3">{t("metric")}</th><th className="px-5 py-3">{featuredLabel}</th><th className="px-5 py-3">{t("evolution")}</th><th className="px-5 py-3">{t("origin")}</th></tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.label} className="border-t border-border">
                  <td className="px-5 py-3"><p className="font-bold">{metric.label}</p><p className="text-xs text-muted-foreground">{metric.description}</p></td>
                  <td className="px-5 py-3 text-base font-bold tabular-nums">{metric.value}</td>
                  <td className="px-5 py-3 text-sm font-bold text-muted-foreground">{metric.evolution}</td>
                  <td className="px-5 py-3"><SourceBadge source={metric.source} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sticker-card-dashed flex flex-wrap items-center justify-between gap-4 p-5" aria-labelledby="manual-metrics-title">
        <div>
          <h2 id="manual-metrics-title" className="text-sm font-bold">{t("manualTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("manualHelp")}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setOpen({ year, month: featuredMonth })}>{t("enter")}</Button><Button type="button" variant="outline" onClick={() => setImportOpen(true)}>{t("import")}</Button></div>
      </section>

      {open && (
        <MonthModal
          key={`${open.year}-${open.month}`}
          year={open.year}
          month={open.month}
          initialData={
            open.year === year ? rowFor(open.month) : null /* navigated to another year, not fetched here */
          }
          monthRowsThisYear={open.year === year ? monthRows : []}
          postLeadsThisMonth={open.year === year ? (postLeadsByMonth[open.month] ?? 0) : 0}
          salesThisMonth={open.year === year ? salesByMonth[open.month] : undefined}
          pipelineVolumesThisMonth={open.year === year ? pipelineVolumesByMonth[open.month] : undefined}
          allSettingEntries={allSettingEntries}
          allClosingEntries={allClosingEntries}
          callSource={callSourcesByMonth[monthKey(open.year, open.month)] ?? null}
          onClose={() => setOpen(null)}
          onNavigate={(nextYear, nextMonth) => setOpen({ year: nextYear, month: nextMonth })}
        />
      )}
    </div>
  );
}
