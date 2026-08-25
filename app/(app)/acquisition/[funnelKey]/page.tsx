import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { AgentBanner } from "@/components/agent-banner";
import { AcquisitionFunnelConfigForm, type ConfigurationField } from "@/components/acquisition-funnel-config-form";
import { AcquisitionFunnelDataForm, type MetricField } from "@/components/acquisition-funnel-data-form";
import { AcquisitionFunnelMini } from "@/components/acquisition-funnel-mini";
import { FunnelBlockPage } from "@/components/funnel-block-page";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { formatEur } from "@/lib/currency";
import { filterVisibleContentPosts } from "@/lib/content-posts/visibility";
import { isSameReportingMonth, resolveContentReportingMonth } from "@/lib/content-posts/reporting-period";
import { aggregateContentTotals } from "@/lib/diagnostic/content-metrics";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { currentMonthWindow, lastCompletedMonths, type MonthWindow } from "@/lib/diagnostic/completed-months";
import { resolveDealPrice } from "@/lib/diagnostic/cascade";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { isInstallmentPaymentSale } from "@/lib/sales/types";
import { getAcquisitionFunnelBenchmarks, getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { getFunnelBlockBenchmarks, getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { funnelBlockKeyFromSlug } from "@/lib/funnel-blocks/routes";
import { isFunnelSourceKey, type FunnelSourceKey } from "@/lib/funnel-blocks/types";
import { normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";
import { acquisitionFunnelHref, acquisitionFunnelKeyFromSlug } from "@/lib/acquisition-funnels/routes";
import { buildAdaptiveFunnel, type AdaptiveFunnelVariant } from "@/lib/acquisition-funnels/metrics";
import { buildAcquisitionStageVolumes } from "@/lib/acquisition-funnels/stage-volumes";
import { normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import type { AcquisitionFunnelKey } from "@/lib/acquisition-funnels/types";
import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { inRange } from "@/lib/dashboard/metrics";
import { isMonthlyCallSourceAvailable, monthKey } from "@/lib/monthly-metrics/call-source";
import { getAccountContext } from "@/lib/team/context";
import { track } from "@/lib/analytics";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";

type FunnelPageProps = {
  params: Promise<{ funnelKey: string }>;
  searchParams: Promise<{ source?: string }>;
};

const ACQUISITION_PERMISSIONS = [
  "acquisition:contenu",
  "acquisition:mail",
  "acquisition:pipeline",
  "acquisition:setters",
  "acquisition:ads",
] as const;

function sourceHref(inputMetricKey: string, funnelKey: AcquisitionFunnelKey): string {
  if (inputMetricKey.includes("content")) return "/acquisition/contenu";
  if (inputMetricKey.includes("newsletter")) return "/acquisition/mail";
  if (["calls_booked", "calls_proposed", "first_messages", "conversations", "new_followers"].includes(inputMetricKey)) {
    return "/ventes/pipeline/funnel";
  }
  if (inputMetricKey === "calls_attended") return "/ventes/appels";
  if (inputMetricKey === "sales_closed") return "/ventes/suivi";
  return acquisitionFunnelHref(funnelKey);
}

function isSharedMetric(inputMetricKey: string): boolean {
  return ["calls_booked", "calls_attended", "sales_closed"].includes(inputMetricKey);
}

function sourceLabel(inputMetricKey: string, t: ReturnType<typeof getTranslations> extends Promise<infer T> ? T : never): string {
  if (inputMetricKey.includes("content")) return t("sourceContent");
  if (inputMetricKey.includes("newsletter")) return t("sourceMail");
  if (["calls_booked", "calls_proposed", "first_messages", "conversations", "new_followers"].includes(inputMetricKey)) return t("sourcePipeline");
  if (inputMetricKey === "calls_attended") return t("sourceCalls");
  if (inputMetricKey === "sales_closed") return t("sourceSales");
  return t("sourceJourney");
}

function monthLabel(month: MonthWindow, locale: string): string {
  return new Date(Date.UTC(month.year, month.month - 1, 1)).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatVolume(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(Math.round(value));
}

function formatDelta(current: number | null, previous: number | null, locale: string): string {
  if (current === null || previous === null) return "—";
  const delta = Math.round(current - previous);
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${new Intl.NumberFormat(locale).format(Math.abs(delta))}`;
}

function configurationFields(
  funnelKey: AcquisitionFunnelKey,
  profile: Awaited<ReturnType<typeof getBusinessProfile>>,
  t: (key: string) => string
): ConfigurationField[] {
  switch (funnelKey) {
    case "lead_magnet":
      return [
        { name: "type", label: t("leadMagnetType"), type: "select", value: profile.acquisition.leadMagnet.type, options: ["pdf", "video", "formation_gratuite", "communaute", "audit", "autre"].map((value) => ({ value, label: t(`leadMagnetTypes.${value}`) })) },
        { name: "title", label: t("leadMagnetTitle"), type: "text", value: profile.acquisition.leadMagnet.title },
        { name: "promise", label: t("leadMagnetPromise"), type: "text", value: profile.acquisition.leadMagnet.promise },
        { name: "url", label: t("link"), type: "url", value: profile.acquisition.leadMagnet.url },
      ];
    case "vsl":
      return [
        { name: "url", label: t("link"), type: "url", value: profile.acquisition.vsl.url },
        { name: "durationMin", label: t("duration"), type: "number", value: profile.acquisition.vsl.durationMin },
        { name: "cta", label: t("cta"), type: "text", value: profile.acquisition.vsl.cta },
      ];
    case "setting_dm":
      return [
        { name: "channel", label: t("channel"), type: "text", value: profile.acquisition.setting.channel },
        { name: "operator", label: t("operator"), type: "text", value: profile.acquisition.setting.operator },
      ];
    case "quiz":
      return [
        { name: "url", label: t("quizUrl"), type: "url", value: profile.acquisition.configurations.quiz.url },
        { name: "questionCount", label: t("questionCount"), type: "number", value: profile.acquisition.configurations.quiz.questionCount },
        { name: "tool", label: t("tool"), type: "text", value: profile.acquisition.configurations.quiz.tool },
      ];
    case "appel_direct":
      return [
        { name: "bookingUrl", label: t("bookingUrl"), type: "url", value: profile.acquisition.configurations.appel_direct.bookingUrl },
        { name: "calendarTool", label: t("calendarTool"), type: "text", value: profile.acquisition.configurations.appel_direct.calendarTool },
      ];
    case "webinaire":
      return [
        { name: "format", label: t("format"), type: "select", value: profile.acquisition.configurations.webinaire.format, options: [{ value: "live", label: t("live") }, { value: "evergreen", label: t("evergreen") }] },
        { name: "frequency", label: t("frequency"), type: "text", value: profile.acquisition.configurations.webinaire.frequency },
        { name: "url", label: t("link"), type: "url", value: profile.acquisition.configurations.webinaire.url },
      ];
    case "challenge":
      return [
        { name: "durationDays", label: t("durationDays"), type: "number", value: profile.acquisition.configurations.challenge.durationDays },
        { name: "frequency", label: t("frequency"), type: "text", value: profile.acquisition.configurations.challenge.frequency },
        { name: "url", label: t("link"), type: "url", value: profile.acquisition.configurations.challenge.url },
      ];
    case "newsletter":
      return [
        { name: "tool", label: t("tool"), type: "text", value: profile.acquisition.configurations.newsletter.tool },
        { name: "listSize", label: t("listSize"), type: "number", value: profile.acquisition.configurations.newsletter.listSize },
        { name: "frequency", label: t("frequency"), type: "text", value: profile.acquisition.configurations.newsletter.frequency },
      ];
    case "vente_directe":
      return [
        { name: "url", label: t("link"), type: "url", value: profile.acquisition.configurations.vente_directe.url },
        { name: "displayedPrice", label: t("displayedPrice"), type: "decimal", value: profile.acquisition.configurations.vente_directe.displayedPrice },
      ];
    case "communaute":
      return [
        { name: "platform", label: t("platform"), type: "text", value: profile.acquisition.configurations.communaute.platform },
        { name: "memberCount", label: t("memberCount"), type: "number", value: profile.acquisition.configurations.communaute.memberCount },
      ];
  }
}

export default async function AcquisitionFunnelPage({ params, searchParams }: FunnelPageProps) {
  const { funnelKey: slug } = await params;
  const query = await searchParams;

  const locale = await getLocale();
  const t = await getTranslations("app.acquisition.journey");
  const { userId, accountId, user } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const hasAcquisitionAccess = Boolean(
    context && (context.isOwner || ACQUISITION_PERMISSIONS.some((permission) => context.permissions.has(permission)))
  );
  if (!context || !hasAcquisitionAccess) redirect("/dashboard");

  const [blockCatalog, blockProfile, monthlyRows] = await Promise.all([
    getFunnelBlockCatalog(),
    getBusinessProfile(accountId),
    getAllMonthlyMetrics(accountId),
  ]);
  const blockKey = funnelBlockKeyFromSlug(slug, blockCatalog);
  if (blockKey) {
    const blockSelection = normalizeFunnelBlockSelection(blockProfile.acquisition, blockCatalog);
    const blockEntry = blockCatalog.find((entry) => entry.blockKey === blockKey);
    if (!blockEntry) notFound();
    if (!blockSelection.blocks.some((item) => item.blockKey === blockKey)) {
      after(() => track("acquisition_page_blocked", userId, { block_key: blockKey }));
      redirect(`/acquisition?blocked=${encodeURIComponent(blockKey)}`);
    }
    const currentMonth = currentMonthWindow();
    const currentRow = monthlyRows.find((row) => row.year === currentMonth.year && row.month === currentMonth.month) ?? null;
    const source: FunnelSourceKey | "total" = isFunnelSourceKey(query.source) ? query.source : "total";
    if (source !== "total") after(() => track("source_filter_used", userId, { source, page: "acquisition_block" }));
    const benchmarks = await getFunnelBlockBenchmarks([blockKey], user?.sector ?? null);
    return (
      <FunnelBlockPage
        entry={blockEntry}
        selection={blockSelection}
        catalog={blockCatalog}
        benchmarks={benchmarks}
        currentRow={currentRow}
        monthlyRows={monthlyRows}
        source={source}
        profile={blockProfile}
      />
    );
  }

  const funnelKey = acquisitionFunnelKeyFromSlug(slug);
  if (!funnelKey) notFound();

  const [profile, catalog, rawData] = await Promise.all([
    getBusinessProfile(accountId),
    getAcquisitionFunnelCatalog(),
    getDiagnosticKpiRawData(accountId),
  ]);
  const entry = catalog.find((candidate) => candidate.funnelKey === funnelKey) ?? null;
  const selection = normalizeAcquisitionSelection(profile.acquisition, catalog);
  if (!entry) notFound();
  const funnelEntry = entry;
  if (!selection.funnels.includes(funnelKey)) {
    after(() => track("acquisition_page_blocked", userId, { funnel_key: funnelKey }));
    redirect(`/acquisition?blocked=${encodeURIComponent(funnelKey)}`);
  }
  after(() => track("acquisition_page_viewed", userId, { funnel_key: funnelKey }));

  const benchmarks = await getAcquisitionFunnelBenchmarks([funnelKey], user?.sector ?? null);
  const visibleContentPosts = filterVisibleContentPosts(rawData.allContentPosts, rawData.allYoutubeVideoInsights);
  const currentMonth = currentMonthWindow();
  const importedContentMonth = resolveContentReportingMonth(visibleContentPosts, currentMonth);
  // Keep the fallback for content-only reporting, but never let a stale
  // imported audience become the denominator for current-month funnel data.
  const currentContentMonth = isSameReportingMonth(importedContentMonth, currentMonth)
    ? importedContentMonth
    : currentMonth;

  function buildSnapshot(month: MonthWindow, contentMonth: MonthWindow): { month: MonthWindow; variant: AdaptiveFunnelVariant } {
    const monthlyRow = rawData.allMonthlyRows.find((row) => row.year === month.year && row.month === month.month) ?? null;
    const monthSettingEntries = rawData.allSettingEntries.filter((entry) => inRange(entry.date, month.range));
    const monthClosingEntries = rawData.allClosingEntries.filter((entry) => inRange(entry.date, month.range));
    const callSource = rawData.allCallSourcesByMonth[monthKey(month.year, month.month)] ?? null;
    const periodTotals = aggregatePeriodTotals({
      months: [month],
      allMonthlyRows: rawData.allMonthlyRows,
      allSettingEntries: rawData.allSettingEntries,
      allClosingEntries: rawData.allClosingEntries,
      callSourcesByMonth: rawData.allCallSourcesByMonth,
      allSales: rawData.allSales,
      allLeads: rawData.allLeads,
      allLeadStageHistory: rawData.allLeadStageHistory,
      allEmailCampaigns: rawData.allEmailCampaigns,
      allMetaMetrics: rawData.allMetaMetrics,
      allNativeBookingLeads: rawData.allNativeBookingLeads,
    });
    const contentPosts = visibleContentPosts.filter((post) => inRange(post.publishedAt, contentMonth.range));
    const contentTotals = aggregateContentTotals([contentMonth], visibleContentPosts, rawData.allVideoAttributionTotals);
    const hasSettingData =
      monthSettingEntries.length > 0 ||
      [monthlyRow?.newFollowers, monthlyRow?.firstMessages, monthlyRow?.conversations, monthlyRow?.callsProposed, monthlyRow?.callsBooked].some((value) => value !== null && value !== undefined) ||
      isMonthlyCallSourceAvailable(callSource);
    const hasClosingData =
      monthClosingEntries.length > 0 ||
      [monthlyRow?.callsTaken, monthlyRow?.salesClosed].some((value) => value !== null && value !== undefined) ||
      isMonthlyCallSourceAvailable(callSource) ||
      rawData.allSales.some((sale) => !sale.isOrphan && !isInstallmentPaymentSale(sale) && inRange(sale.saleDate, month.range));
    const dealPrice = resolveDealPrice(profile, periodTotals.closingTotals, periodTotals.cashContractedTotal);
    return {
      month,
      variant: buildAdaptiveFunnel({
        entry: funnelEntry,
        stageVolumes: buildAcquisitionStageVolumes({
          entry: funnelEntry,
          monthlyRow,
          contentTotals,
          contentPostsCount: contentPosts.length,
          settingTotals: periodTotals.settingTotals,
          closingTotals: periodTotals.closingTotals,
          acquisitionTotals: periodTotals.acquisitionTotals,
          hasSettingData,
          hasClosingData,
        }),
        benchmarks,
        dealPrice: dealPrice.price,
        revenue: periodTotals.cashContractedTotal > 0 ? periodTotals.cashContractedTotal : null,
        sourceHrefByMetric: Object.fromEntries(funnelEntry.steps.map((step) => [step.inputMetricKey, sourceHref(step.inputMetricKey, funnelKey!)])),
      }),
    };
  }

  const currentSnapshot = buildSnapshot(currentMonth, currentContentMonth);
  const previousMonth = lastCompletedMonths(1)[0];
  const previousSnapshot = buildSnapshot(previousMonth, previousMonth);
  const historySnapshots = lastCompletedMonths(8).map((month) => buildSnapshot(month, month));
  const currentStages = currentSnapshot.variant.stages;
  const previousStages = previousSnapshot.variant.stages;
  const dataFields: MetricField[] = currentStages.map((stage, index) => ({
    inputMetricKey: funnelEntry.steps[index]?.inputMetricKey ?? stage.metricKey ?? stage.id,
    label: stage.label,
    unit: stage.unit,
    value: stage.volume,
    sourceHref: stage.sourceHref,
    sourceLabel: sourceLabel(funnelEntry.steps[index]?.inputMetricKey ?? "", t),
    shared: isSharedMetric(funnelEntry.steps[index]?.inputMetricKey ?? ""),
  }));
  const topStage = currentStages.find((stage) => stage.id === currentSnapshot.variant.bottleneckId) ?? null;
  const journeyHref = acquisitionFunnelHref(funnelKey);
  const configFields = configurationFields(funnelKey, profile, t);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/acquisition" className="text-xs font-bold text-accent-text hover:underline">← {t("journeyLabel")}</Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">{funnelEntry.label}</h1>
            {selection.primaryFunnel === funnelKey && <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-text">{t("primary")}</span>}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{funnelEntry.description}</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">{t("active")}</span>
      </div>

      <AgentBanner
        stateText={topStage ? t("falcoState", { label: topStage.label }) : t("falcoStateNoGain")}
        ctaLabel={t("improve")}
        chatContext={{ topicType: "general", topicKey: null, topicLabel: funnelEntry.label, sourcePage: journeyHref }}
        period="current-month"
        gapBadge={topStage && topStage.currentRate !== null && topStage.benchmarkRate !== null ? `${t("you")}: ${Math.round(topStage.currentRate * 100)}% · ${t("benchmark")}: ${Math.round(topStage.benchmarkRate * 100)}%` : null}
        falcoSkin={resolveFalcoSkin(journeyHref)}
      />

      <section aria-labelledby="journey-metrics-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("metricsEyebrow")}</p>
            <h2 id="journey-metrics-heading" className="mt-1 text-lg font-bold">{t("metricsTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("metricsHelp")}</p>
          </div>
          {importedContentMonth.year !== currentMonth.year || importedContentMonth.month !== currentMonth.month ? (
            <span className="text-xs font-medium text-muted-foreground">{t("periodImported", { period: monthLabel(importedContentMonth, locale) })}</span>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {currentStages.map((stage, index) => {
            const previous = previousStages[index];
            const hasBenchmark = stage.benchmarkRate !== null;
            const hasRate = stage.currentRate !== null && stage.benchmarkRate !== null;
            const status = !hasRate ? "text-muted-foreground" : stage.currentRate! >= stage.benchmarkRate! ? "text-state-healthy" : (stage.benchmarkRate! - stage.currentRate!) / stage.benchmarkRate! < 0.2 ? "text-state-caution" : "text-state-critical";
            return (
              <Link key={stage.id} href={stage.sourceHref} prefetch className="sticker-card group flex min-h-[154px] flex-col p-4 transition-colors hover:border-border-hover">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className={`text-[11px] font-bold ${status}`}>{hasRate ? (stage.currentRate! >= stage.benchmarkRate! ? "OK" : t("bottleneckDetected")) : t("toMeasure")}</span>
                </div>
                <p className="mt-2 text-sm font-bold group-hover:text-accent-text">{stage.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-[-0.02em] tabular-nums">{formatVolume(stage.volume, locale)} <span className="text-xs font-medium text-muted-foreground">{stage.unit}</span></p>
                <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3 text-xs">
                  <span className="text-muted-foreground">{t("delta")}: <strong className="text-foreground">{formatDelta(stage.volume, previous?.volume ?? null, locale)}</strong></span>
                  <span className="text-muted-foreground">{t("benchmark")}: <strong className="text-foreground">{hasBenchmark ? `${Math.round((stage.benchmarkRate ?? 0) * 100)}%` : "—"}</strong></span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <AcquisitionFunnelMini variant={currentSnapshot.variant} />

      <AcquisitionFunnelDataForm funnelKey={funnelKey} year={currentMonth.year} month={currentMonth.month} fields={dataFields} />

      <section className="sticker-card p-5 sm:p-6" aria-labelledby="journey-history-title">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("historyEyebrow")}</p>
          <h2 id="journey-history-title" className="mt-1 text-lg font-bold">{t("historyTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("historyHelp")}</p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[150px_repeat(8,minmax(60px,1fr))] items-end gap-2 border-b border-border pb-2 text-[11px] font-bold text-muted-foreground">
              <span />
              {historySnapshots.map((snapshot) => <span key={`${snapshot.month.year}-${snapshot.month.month}`} className="text-center">{monthLabel(snapshot.month, locale)}</span>)}
            </div>
            <div className="divide-y divide-border">
              {funnelEntry.steps.map((step, index) => {
                const values = historySnapshots.map((snapshot) => snapshot.variant.stages[index]?.volume ?? null);
                const max = Math.max(...values.filter((value): value is number => value !== null), 1);
                return (
                  <div key={step.inputMetricKey} className="grid grid-cols-[150px_repeat(8,minmax(60px,1fr))] items-end gap-2 py-3">
                    <span className="truncate text-xs font-bold">{step.label}</span>
                    {values.map((value, valueIndex) => (
                      <div key={`${step.inputMetricKey}-${valueIndex}`} className="flex h-12 items-end justify-center" title={value === null ? t("toMeasure") : formatVolume(value, locale)}>
                        <span className="block w-6 rounded-t-[4px] bg-accent/80" style={{ height: value === null ? "3px" : `${Math.max(8, (value / max) * 100)}%`, opacity: value === null ? 0.2 : 1 }} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <AcquisitionFunnelConfigForm funnelKey={funnelKey} fields={configFields} />

      {currentSnapshot.variant.totalPotential !== null && (
        <p className="text-xs text-muted-foreground">{t("funnelHelp")} · {formatEur(currentSnapshot.variant.totalPotential, locale)} {t("perMonth")}</p>
      )}
    </div>
  );
}
