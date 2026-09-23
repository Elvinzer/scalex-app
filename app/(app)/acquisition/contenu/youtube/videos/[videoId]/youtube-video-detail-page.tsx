"use client";

import { ArrowLeft, Check, ChevronRight, ExternalLink, Play, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { InfoPopover } from "@/components/info-popover";
import { Button } from "@/components/ui/button";
import { formatDurationSeconds } from "@/components/youtube/youtube-video-detail-dialog";
import { diagnoseYoutubeVideo, type YoutubeDiagnosticLevel } from "@/lib/youtube/diagnosis";
import { aggregateTrafficSources, hasRetentionCurve, retentionAtSeconds } from "@/lib/youtube/retention";
import { bookingsPerThousandViews, revenuePerThousandViews, salesPerThousandViews, subscribersPerThousandViews } from "@/lib/youtube/rates";
import type { YoutubeVideoInsightRow, YoutubeVideoSnapshotRow } from "@/lib/youtube/queries";
import { snapshotImpressionsAtDay, snapshotViewsAtDay, velocityPercent } from "@/lib/youtube/velocity";
import { cn } from "@/lib/utils";

type Comparison = { tier: "above" | "inline" | "below"; ratio: number; value: number; baseline: number; cohortSize: number } | null;
type Comparisons = {
  views: Comparison;
  retention30: Comparison;
  retention: Comparison;
  bookingsPer1000: Comparison;
  revenuePer1000: Comparison;
  subsPer1000: Comparison;
};
type Commercial = {
  bookings: number | null;
  dealsClosed: number | null;
  declaredSales: number;
  estimatedSales: number;
  declaredRevenueEur: number | null;
  estimatedRevenueEur: number | null;
  revenueEur: number | null;
  canShowEuros: boolean;
};
type EndScreenMetric = { id: string; elementType: string; elementId: string; impressions: number | null; clicks: number | null; clickRate: number | null };
type CardMetric = { id: string; cardType: string; cardId: string; impressions: number | null; clicks: number | null; clickRate: number | null };

const LEVEL_CLASS: Record<YoutubeDiagnosticLevel, string> = {
  strong: "border-state-healthy/40 bg-state-healthy/10 text-state-healthy",
  good: "border-state-healthy/30 bg-state-healthy/5 text-state-healthy",
  medium: "border-state-caution/40 bg-state-caution/10 text-state-caution",
  weak: "border-state-critical/40 bg-state-critical/10 text-state-critical",
  unavailable: "border-border bg-muted text-muted-foreground",
};

function formatNumber(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(value);
}

function formatPercent(value: number | null, locale: string): string {
  return value === null ? "—" : `${new Intl.NumberFormat(locale).format(Math.round(value * 10) / 10)}%`;
}

function formatMoney(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(value);
}

function formatUpdatedAt(value: Date | null, locale: string, t: ReturnType<typeof useTranslations>): string {
  if (!value) return t("dataUnavailable");
  const hours = Math.max(1, Math.round((Date.now() - value.getTime()) / 3_600_000));
  return t("updatedAgo", { hours });
}

function linePath(video: YoutubeVideoInsightRow): string | null {
  if (!hasRetentionCurve(video)) return null;
  const points = video.retentionCurve ?? [];
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${Math.max(0, Math.min(100, point.ratio * 100)).toFixed(2)} ${(40 - Math.max(0, Math.min(1, point.watchRatio)) * 36).toFixed(2)}`)
    .join(" ");
}

function MetricCard({ label, value, note, help, muted = false, accent = false }: { label: string; value: string; note?: string; help?: string; muted?: boolean; accent?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-control)] border p-4", accent ? "border-accent-border bg-accent-soft" : muted ? "border-border bg-muted" : "border-border bg-card")}>
      <div className="flex items-center gap-1">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
        {help && <InfoPopover text={help} ariaLabel={label} />}
      </div>
      <p className={cn("mt-1 font-display text-xl font-bold tabular-nums", muted && "text-muted-foreground")}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function reachDetailMetric(
  value: number | null,
  video: YoutubeVideoInsightRow,
  reportingSyncStatus: string | null,
  formatValue: (value: number) => string,
  t: ReturnType<typeof useTranslations>,
): { value: string; help?: string; muted: boolean } {
  if (value !== null) return { value: formatValue(value), muted: false };
  if (video.reachStatus === "historically_unavailable") {
    return { value: t("reachHistoricalUnavailable"), help: t("reachHistoricalHelp"), muted: true };
  }
  if (video.reachStatus === "pending" && reportingSyncStatus === "failed") {
    return { value: t("reachSyncError"), help: t("reachSyncErrorHelp"), muted: true };
  }
  if (video.reachStatus === "pending") {
    return { value: t("reachPending"), help: t("reachPendingHelp"), muted: true };
  }
  return { value: t("dataUnavailable"), help: t("reachMetricUnavailableHelp"), muted: true };
}

export function YoutubeVideoDetailPage({
  video,
  snapshots,
  commercial,
  comparison,
  velocity,
  endScreenMetrics,
  cardMetrics,
  locale,
  lastSyncAt,
  reportingSyncStatus,
}: {
  video: YoutubeVideoInsightRow;
  snapshots: YoutubeVideoSnapshotRow[];
  commercial: Commercial;
  comparison: Comparisons;
  velocity: { benchmarkDay7: number | null };
  endScreenMetrics: EndScreenMetric[];
  cardMetrics: CardMetric[];
  locale: string;
  lastSyncAt: Date | null;
  reportingSyncStatus: string | null;
}) {
  const currentLocale = useLocale();
  const router = useRouter();
  const t = useTranslations("content.youtubeAnalytics");
  const retention30 = retentionAtSeconds(video, 30);
  const retention60 = retentionAtSeconds(video, 60);
  const lowSample = (video.views ?? 0) < 100;
  const revenueValue = revenuePerThousandViews(commercial.revenueEur, video.views);
  const bookingsValue = bookingsPerThousandViews(commercial.bookings, video.views);
  const salesValue = salesPerThousandViews(commercial.dealsClosed, video.views);
  const businessComparison = revenueValue !== null ? comparison.revenuePer1000 : comparison.bookingsPer1000;
  const diagnostics = diagnoseYoutubeVideo({
    video,
    baselineViews: comparison.views?.baseline ?? null,
    baselineRetention: comparison.retention?.baseline ?? null,
    businessValue: revenueValue ?? bookingsValue,
    businessBaseline: businessComparison?.baseline ?? null,
    bookings: commercial.bookings,
    revenueEur: commercial.revenueEur,
  });
  const curvePath = linePath(video);
  const traffic = aggregateTrafficSources([video]);
  const velocityJ1 = snapshotViewsAtDay(snapshots, video.publishedAt, 1);
  const velocityJ2 = snapshotViewsAtDay(snapshots, video.publishedAt, 2);
  const velocityJ7 = snapshotViewsAtDay(snapshots, video.publishedAt, 7);
  const impressionsJ1 = snapshotImpressionsAtDay(snapshots, video.publishedAt, 1);
  const impressionsJ2 = snapshotImpressionsAtDay(snapshots, video.publishedAt, 2);
  const impressionsJ7 = snapshotImpressionsAtDay(snapshots, video.publishedAt, 7);
  const velocityDelta = velocityPercent(velocityJ7, velocity.benchmarkDay7);
  const numberLocale = locale || currentLocale;
  const activeReporting = reportingSyncStatus === "pending" || reportingSyncStatus === "syncing";
  const thumbnailImpressions = reachDetailMetric(
    video.impressions,
    video,
    reportingSyncStatus,
    (value) => formatNumber(value, numberLocale),
    t,
  );
  const thumbnailCtr = reachDetailMetric(
    video.impressionsClickThroughRate,
    video,
    reportingSyncStatus,
    (value) => formatPercent(value, numberLocale),
    t,
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-10">
      <button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.replace("/acquisition/contenu?platform=youtube"); }} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("backToVideos")}
      </button>

      <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
          <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer" aria-label={`${t("externalVideo")}: ${video.title}`} className="group relative flex aspect-video w-full max-w-xs shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-border bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
            {video.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- YouTube owns the remote thumbnail.
              <img src={video.thumbnailUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
            ) : <span className="text-muted-foreground"><Play className="size-8 fill-current" aria-hidden="true" /></span>}
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/10 opacity-0 transition-opacity group-hover:opacity-100"><Play className="size-8 fill-card text-card" aria-hidden="true" /></span>
          </a>
          <div className="min-w-0">
            <h1 className="text-[clamp(1.5rem,3vw,2.25rem)] leading-tight font-bold tracking-[-0.03em]">{video.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("published", { date: formatDate(video.publishedAt, numberLocale) })} · {formatDurationSeconds(video.durationSeconds)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-bold text-state-healthy">
              <Check className="size-4" aria-hidden="true" /> {t("synced")} <span className="font-normal text-muted-foreground">· {formatUpdatedAt(lastSyncAt, numberLocale, t)}</span>
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="self-start">
          <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer">
            {t("viewOnYoutube")} <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </Button>
      </header>

      <section aria-labelledby="youtube-diagnosis-title">
        <h2 id="youtube-diagnosis-title" className="mb-3 text-base font-bold">{t("quickDiagnosis")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {diagnostics.map((diagnostic) => (
            <div key={diagnostic.axis} className={cn("rounded-[var(--radius-control)] border p-4", LEVEL_CLASS[diagnostic.level])}>
              <p className="text-xs font-bold tracking-wide uppercase">{t(`axis.${diagnostic.axis}`)}</p>
              <p className="mt-1 text-lg font-bold">{t(`level.${diagnostic.level}`)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-[var(--radius-control)] bg-muted p-4 text-sm text-muted-foreground">{diagnosisInsight(diagnostics, t)}</p>
        {lowSample && <p className="mt-2 flex items-center gap-2 text-sm font-bold text-muted-foreground"><span className="size-2 rounded-full bg-state-unknown" aria-hidden="true" /> {t("lowSample")}</p>}
      </section>

      <section aria-labelledby="youtube-funnel-title">
        <div className="flex items-center gap-2">
          <h2 id="youtube-funnel-title" className="text-base font-bold">{t("funnel")}</h2>
          <span className="text-muted-foreground" title={t("funnelHelp")}>ⓘ</span>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          <MetricCard label={t("thumbnailImpressions")} value={thumbnailImpressions.value} help={thumbnailImpressions.help} muted={thumbnailImpressions.muted} />
          <ChevronRight className="hidden self-center text-muted-foreground lg:block" aria-hidden="true" />
          <MetricCard label={t("thumbnailCtr")} value={thumbnailCtr.value} help={thumbnailCtr.help} muted={thumbnailCtr.muted} />
          <ChevronRight className="hidden self-center text-muted-foreground lg:block" aria-hidden="true" />
          <MetricCard label={t("column.views")} value={formatNumber(video.views, numberLocale)} accent />
          <ChevronRight className="hidden self-center text-muted-foreground lg:block" aria-hidden="true" />
          <MetricCard label={t("retention30Value")} value={formatPercent(retention30 === null ? null : retention30 * 100, numberLocale)} muted={retention30 === null} />
          <ChevronRight className="hidden self-center text-muted-foreground lg:block" aria-hidden="true" />
          <MetricCard label={t("averageViewDuration")} value={formatDurationSeconds(video.averageViewDurationSeconds)} muted={video.averageViewDurationSeconds === null} />
          <ChevronRight className="hidden self-center text-muted-foreground lg:block" aria-hidden="true" />
          <MetricCard label={t("column.watchTime")} value={video.estimatedMinutesWatched === null ? "—" : `${formatNumber(video.estimatedMinutesWatched, numberLocale)} ${t("minutes")}`} muted={video.estimatedMinutesWatched === null} />
        </div>
      </section>

      <section className="sticker-card p-5 sm:p-6" aria-labelledby="youtube-retention-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="youtube-retention-title" className="text-base font-bold">{t("retentionTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("retentionChartHelp")}</p>
          </div>
          {activeReporting && <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-label={t("synced")} />}
        </div>
        {curvePath ? (
          <>
            <div className="mt-5 overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface-sunken p-3">
              <svg viewBox="0 0 100 40" role="img" aria-labelledby="youtube-retention-chart-title" className="h-48 w-full">
                <title id="youtube-retention-chart-title">{t("retentionSummary", { retention30: formatPercent(retention30 === null ? null : retention30 * 100, numberLocale), retention60: formatPercent(retention60 === null ? null : retention60 * 100, numberLocale) })}</title>
                <g aria-hidden="true">
                  {[100, 75, 50, 25].map((level) => {
                    const y = 40 - (level / 100) * 36;
                    return <g key={level}><line x1="0" x2="100" y1={y} y2={y} stroke="var(--border)" strokeDasharray="1 1" /><text x="99" y={y - 0.8} textAnchor="end" fill="var(--muted-foreground)" fontSize="2.5">{level}%</text></g>;
                  })}
                  {video.durationSeconds && video.durationSeconds > 30 && <line x1={(30 / video.durationSeconds) * 100} x2={(30 / video.durationSeconds) * 100} y1="4" y2="40" stroke="var(--border)" strokeDasharray="1 1" />}
                  {video.durationSeconds && video.durationSeconds > 60 && <line x1={(60 / video.durationSeconds) * 100} x2={(60 / video.durationSeconds) * 100} y1="4" y2="40" stroke="var(--border)" strokeDasharray="1 1" />}
                  {video.durationSeconds && video.durationSeconds > 30 && <text x={(30 / video.durationSeconds) * 100} y="39" textAnchor="middle" fill="var(--muted-foreground)" fontSize="2.5">0:30</text>}
                  {video.durationSeconds && video.durationSeconds > 60 && <text x={(60 / video.durationSeconds) * 100} y="39" textAnchor="middle" fill="var(--muted-foreground)" fontSize="2.5">1:00</text>}
                </g>
                <path d={curvePath} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t("retentionSummary", { retention30: formatPercent(retention30 === null ? null : retention30 * 100, numberLocale), retention60: formatPercent(retention60 === null ? null : retention60 * 100, numberLocale) })}</p>
            <table className="sr-only">
              <caption>{t("retentionTitle")}</caption>
              <thead><tr><th>{t("column.retention")}</th><th>{t("column.views")}</th></tr></thead>
              <tbody>{(video.retentionCurve ?? []).filter((_, index, points) => index % 10 === 0 || index === points.length - 1).map((point) => <tr key={point.ratio}><td>{Math.round(point.ratio * 100)}%</td><td>{formatPercent(point.watchRatio * 100, numberLocale)}</td></tr>)}</tbody>
            </table>
          </>
        ) : <p className="mt-5 rounded-[var(--radius-control)] bg-muted p-4 text-sm text-muted-foreground">{t("retention30Unavailable")}</p>}
      </section>

      <section aria-labelledby="youtube-traffic-title">
        <h2 id="youtube-traffic-title" className="text-base font-bold">{t("trafficOrigin")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("trafficHelp")}</p>
        <div className="mt-3 rounded-[var(--radius-card)] border border-border bg-card p-5">
          {traffic.length === 0 ? <p className="text-sm text-muted-foreground">{t("noTrafficData")}</p> : <div className="space-y-3">{traffic.map((item) => <div key={item.source}><div className="flex items-center justify-between gap-3 text-sm font-bold"><span>{t(`traffic.${item.source}`)}</span><span className="tabular-nums text-muted-foreground">{formatPercent(item.share * 100, numberLocale)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, Math.round(item.share * 100))}%` }} /></div></div>)}</div>}
        </div>
      </section>

      <section aria-labelledby="youtube-velocity-title">
        <div className="flex items-center gap-2"><h2 id="youtube-velocity-title" className="text-base font-bold">{t("velocity")}</h2><span className="text-muted-foreground" title={t("velocityHelp")}>ⓘ</span></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MetricCard label={t("velocityJ1")} value={formatNumber(velocityJ1, numberLocale)} note={impressionsJ1 === null ? undefined : t("velocityImpressions", { value: formatNumber(impressionsJ1, numberLocale) })} muted={velocityJ1 === null} />
          <MetricCard label={t("velocityJ2")} value={formatNumber(velocityJ2, numberLocale)} note={impressionsJ2 === null ? undefined : t("velocityImpressions", { value: formatNumber(impressionsJ2, numberLocale) })} muted={velocityJ2 === null} />
          <MetricCard label={t("velocityJ7")} value={formatNumber(velocityJ7, numberLocale)} note={velocityDelta === null ? impressionsJ7 === null ? undefined : t("velocityImpressions", { value: formatNumber(impressionsJ7, numberLocale) }) : t("velocityComparison", { percent: Math.round(velocityDelta) })} muted={velocityJ7 === null} />
        </div>
        <p className="mt-3 rounded-[var(--radius-control)] bg-muted p-3 text-sm text-muted-foreground">{velocityJ7 === null ? t("velocityNotOldEnough") : t("velocityHelp")}{impressionsJ1 === null && impressionsJ2 === null && impressionsJ7 === null ? ` ${t("velocityImpressionsUnavailable")}` : ""}</p>
      </section>

      <section aria-labelledby="youtube-engagement-title">
        <h2 id="youtube-engagement-title" className="text-base font-bold">{t("engagementBusiness")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label={t("likes")} value={formatNumber(video.likes, numberLocale)} muted={video.likes === null} />
          <MetricCard label={t("comments")} value={formatNumber(video.comments, numberLocale)} muted={video.comments === null} />
          <MetricCard label={t("shares")} value={formatNumber(video.shares, numberLocale)} muted={video.shares === null} />
          <MetricCard label={t("subscribersGained")} value={formatNumber(video.subscribersGained, numberLocale)} muted={video.subscribersGained === null} />
          <MetricCard label={t("subscribersLost")} value={formatNumber(video.subscribersLost, numberLocale)} muted={video.subscribersLost === null} />
          <MetricCard label={t("subscribersPer1000")} value={formatNumberValue(subscribersPerThousandViews(video), numberLocale)} muted={subscribersPerThousandViews(video) === null} />
        </div>
      </section>

      <section aria-labelledby="youtube-binge-title">
        <h2 id="youtube-binge-title" className="text-base font-bold">{t("binge")}</h2>
        {endScreenMetrics.length === 0 && cardMetrics.length === 0 ? <p className="mt-3 rounded-[var(--radius-control)] bg-muted p-4 text-sm text-muted-foreground">{t("bingeUnavailable")}</p> : <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label={t("endScreenImpressions")} value={formatNumber(sumMetric(endScreenMetrics.map((metric) => metric.impressions)), numberLocale)} muted={endScreenMetrics.length === 0} /><MetricCard label={t("endScreenClicks")} value={formatNumber(sumMetric(endScreenMetrics.map((metric) => metric.clicks)), numberLocale)} muted={endScreenMetrics.length === 0} /><MetricCard label={t("column.endScreenCtr")} value={formatPercent(averageClickRate(endScreenMetrics.map((metric) => metric.clickRate)), numberLocale)} muted={endScreenMetrics.length === 0} /><MetricCard label={t("column.cardCtr")} value={formatPercent(averageClickRate(cardMetrics.map((metric) => metric.clickRate)), numberLocale)} muted={cardMetrics.length === 0} /></div>}
      </section>

      <section aria-labelledby="youtube-business-title">
        <h2 id="youtube-business-title" className="text-base font-bold">{t("business")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard label={t("bookings")} value={formatNumber(commercial.bookings, numberLocale)} muted={commercial.bookings === null} />
          <MetricCard label={t("sales")} value={formatNumber(commercial.dealsClosed, numberLocale)} muted={commercial.dealsClosed === null} />
          <MetricCard label={t("bookingsPer1000")} value={formatNumberValue(bookingsValue, numberLocale)} muted={bookingsValue === null} />
          <MetricCard label={t("salesPer1000")} value={formatNumberValue(salesValue, numberLocale)} muted={salesValue === null} />
          <MetricCard label={t("revenueDeclared")} value={formatMoney(commercial.declaredRevenueEur, numberLocale)} muted={commercial.declaredRevenueEur === null} note={commercial.declaredSales > 0 ? t("salesCount", { count: commercial.declaredSales }) : undefined} />
          <MetricCard label={t("revenueEstimated")} value={formatMoney(commercial.estimatedRevenueEur, numberLocale)} muted={commercial.estimatedRevenueEur === null} note={commercial.estimatedSales > 0 ? t("salesCount", { count: commercial.estimatedSales }) : undefined} />
          <MetricCard label={t("revenuePer1000")} value={formatMoney(revenuePerThousandViews(commercial.revenueEur, video.views), numberLocale)} muted={!commercial.canShowEuros} />
        </div>
        {!commercial.canShowEuros && <p className="mt-3 text-sm text-muted-foreground">{t("revenueUnavailable")}</p>}
        <p className="mt-3 text-xs text-muted-foreground">{t("commercialTracking")} · {t("editCommercialTracking")}</p>
      </section>
    </div>
  );
}

function averageClickRate(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null);
  return usable.length === 0 ? null : usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function diagnosisInsight(diagnostics: ReturnType<typeof diagnoseYoutubeVideo>, t: ReturnType<typeof useTranslations>): string {
  const levels = new Map(diagnostics.map((diagnostic) => [diagnostic.axis, diagnostic.level]));
  if (levels.get("diffusion") === "weak" && levels.get("retention") === "strong") return t("diagnosisLowReachStrongRetention");
  if (levels.get("diffusion") === "strong" && levels.get("retention") === "weak") return t("diagnosisStrongReachWeakRetention");
  if (levels.get("retention") === "weak") return t("diagnosisRetentionWeak");
  if (levels.get("business") === "strong") return t("diagnosisBusinessStrong");
  return t("diagnosisSummary");
}

function sumMetric(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return usable.length === 0 ? null : usable.reduce((sum, value) => sum + value, 0);
}

function formatNumberValue(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}
