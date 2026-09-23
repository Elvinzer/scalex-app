"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, Info, MonitorPlay, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { InfoPopover } from "@/components/info-popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDurationSeconds } from "@/components/youtube/youtube-video-detail-dialog";
import { type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import { diagnoseYoutubeVideo, type YoutubeDiagnosticLevel } from "@/lib/youtube/diagnosis";
import { type VideoFormat, matchesFormat } from "@/lib/youtube/format";
import { comparisonMetric, computeVideoMetricComparisons, type VideoPerformanceComparison } from "@/lib/youtube/insights-comparison";
import { aggregateTrafficSources } from "@/lib/youtube/retention";
import { bookingsPerThousandViews, netSubscribers, revenuePerThousandViews, subscribersPerThousandViews } from "@/lib/youtube/rates";
import type { YoutubeVideoBingeMetrics, YoutubeVideoInsightRow, YoutubeVideoSnapshotRow } from "@/lib/youtube/queries";
import { summarizeYoutubeTableRow, tableSignalFromComparison, type YoutubeTableDiagnostic, type YoutubeTableSignal } from "@/lib/youtube/table-analysis";
import { cn } from "@/lib/utils";

import { Pager } from "./pager";

type SortKey = "publishedAt" | "views" | "retention";
type PrimaryColumnKey =
  | "performance"
  | "diffusion"
  | "click"
  | "retention"
  | "growth"
  | "business"
  | "diagnosis";
type OptionalColumnKey =
  | "impressions"
  | "ctr"
  | "browse"
  | "suggested"
  | "search"
  | "avgDuration"
  | "watchTime"
  | "likes"
  | "comments"
  | "shares"
  | "subsGained"
  | "subsLost"
  | "velocity1"
  | "velocity2"
  | "velocity7"
  | "endScreenCtr"
  | "cardCtr"
  | "revenuePer1000";
type ColumnKey = PrimaryColumnKey | OptionalColumnKey;
type OptionalColumnGroupKey = "performance" | "acquisition" | "retention" | "engagement" | "binge" | "business";
type OptionalColumnGroup = { key: OptionalColumnGroupKey; columns: readonly OptionalColumnKey[] };

const PAGE_SIZE = 10;
const LOW_SAMPLE_VIEWS = 100;
const DEFAULT_COLUMNS: PrimaryColumnKey[] = ["performance", "diffusion", "click", "retention", "growth", "business", "diagnosis"];
const ALWAYS_VISIBLE_COLUMNS: PrimaryColumnKey[] = [...DEFAULT_COLUMNS];
const OPTIONAL_COLUMN_GROUPS: readonly OptionalColumnGroup[] = [
  { key: "performance", columns: ["impressions", "velocity1", "velocity2", "velocity7"] },
  { key: "acquisition", columns: ["ctr", "browse", "suggested", "search"] },
  { key: "retention", columns: ["avgDuration", "watchTime"] },
  { key: "engagement", columns: ["likes", "comments", "shares", "subsGained", "subsLost"] },
  { key: "binge", columns: ["endScreenCtr", "cardCtr"] },
  { key: "business", columns: ["revenuePer1000"] },
];
const OPTIONAL_COLUMNS: OptionalColumnKey[] = OPTIONAL_COLUMN_GROUPS.flatMap((group) => [...group.columns]);
const ALL_COLUMNS: ColumnKey[] = [...DEFAULT_COLUMNS, ...OPTIONAL_COLUMNS];
const STORAGE_KEY = "minaly:youtube-table-columns:v2";

function isPrimaryColumn(column: ColumnKey): column is PrimaryColumnKey {
  return DEFAULT_COLUMNS.includes(column as PrimaryColumnKey);
}

function desktopColumnWidth(column: ColumnKey): string {
  if (column === "diagnosis") return "w-[7.5rem]";
  if (column === "retention") return "w-[6.75rem]";
  if (column === "click") return "w-[4.375rem]";
  if (column === "growth") return "w-[5.625rem]";
  if (column === "business") return "w-[5.125rem]";
  return isPrimaryColumn(column) ? "w-[5.5rem]" : "w-[6rem]";
}

const SIGNAL_TEXT_CLASS: Record<YoutubeTableSignal, string> = {
  strong: "text-state-healthy",
  good: "text-state-healthy",
  neutral: "text-foreground",
  weak: "text-state-critical",
  unavailable: "text-state-unknown",
};

const DIAGNOSTIC_TONE_CLASS: Record<YoutubeTableDiagnostic["tone"], string> = {
  healthy: "text-state-healthy",
  caution: "text-state-caution",
  critical: "text-state-critical",
  unknown: "text-muted-foreground",
};

const DIAGNOSTIC_DOT_CLASS: Record<YoutubeTableDiagnostic["tone"], string> = {
  healthy: "bg-state-healthy",
  caution: "bg-state-caution",
  critical: "bg-state-critical",
  unknown: "bg-state-unknown",
};

const DIAGNOSTIC_LEVEL_CLASS: Record<YoutubeDiagnosticLevel, string> = {
  strong: "text-state-healthy",
  good: "text-state-healthy",
  medium: "text-state-caution",
  weak: "text-state-critical",
  unavailable: "text-state-unknown",
};

type YoutubeMetricComparisons = Record<
  "views" | "impressions" | "ctr" | "retention30" | "retention" | "subsPer1000" | "bookingsPer1000" | "revenuePer1000",
  Map<string, VideoPerformanceComparison>
>;

function VideoThumbnail({ thumbnailUrl }: { thumbnailUrl: string | null }) {
  const [broken, setBroken] = useState(false);

  if (!thumbnailUrl || broken) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-muted">
        <MonitorPlay className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- YouTube hosts the thumbnail on an external CDN.
    <img
      src={thumbnailUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="size-10 shrink-0 rounded-[var(--radius-control)] border border-border object-cover"
    />
  );
}

function formatNumber(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(value);
}

function formatPercent(value: number | null, locale: string): string {
  return value === null ? "—" : `${new Intl.NumberFormat(locale).format(Math.round(value * 10) / 10)}%`;
}

function formatCurrency(value: number | null, locale: string): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function velocityAtDay(snapshots: YoutubeVideoSnapshotRow[], publishedAt: Date, days: number): number | null {
  const target = new Date(publishedAt.getTime() + days * 86_400_000);
  const snapshot = snapshots.find((row) => row.capturedOn >= dayString(target));
  return snapshot?.views ?? null;
}

function computeTopVideos(videos: YoutubeVideoInsightRow[]): YoutubeVideoInsightRow[] {
  return [...videos]
    .filter((video) => video.views !== null)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 3);
}

function comparisonDetail(
  t: ReturnType<typeof useTranslations>,
  comparison: VideoPerformanceComparison,
): string {
  const delta = Math.round((comparison.ratio - 1) * 100);
  return t("comparisonDetail", {
    delta: `${delta > 0 ? "+" : ""}${delta}`,
    count: comparison.cohortSize,
  });
}

function SignalStatus({
  status,
  comparison,
  compact = false,
  showComparison = true,
  t,
}: {
  status: YoutubeTableSignal;
  comparison: VideoPerformanceComparison | null;
  compact?: boolean;
  showComparison?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-0.5 text-xs font-bold leading-tight", SIGNAL_TEXT_CLASS[status])}>
      {t(`${compact ? "signalShort" : "signal"}.${status}`)}
      {showComparison && comparison && <InfoPopover text={comparisonDetail(t, comparison)} ariaLabel={t("comparisonDetails")} />}
    </span>
  );
}

function MetricBlock({
  label,
  value,
  secondary,
  status,
  comparison,
  help,
  compact = false,
  showNeutralStatus = false,
  t,
}: {
  label: string;
  value: ReactNode;
  secondary?: ReactNode;
  status?: YoutubeTableSignal;
  comparison?: VideoPerformanceComparison | null;
  help?: string;
  compact?: boolean;
  showNeutralStatus?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="min-w-0">
      {!compact && <div className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        <span>{label}</span>
        {help && <InfoPopover text={help} ariaLabel={t("metricHelp")} />}
      </div>}
      <p className="mt-1 font-display text-base font-bold leading-tight tabular-nums">{value}</p>
      {secondary && <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p>}
      {status && (showNeutralStatus || status !== "neutral") && <SignalStatus status={status} comparison={comparison ?? null} compact={compact} showComparison={!compact} t={t} />}
    </div>
  );
}

function diagnosticLevelFromSignal(signal: YoutubeTableSignal): YoutubeDiagnosticLevel {
  if (signal === "strong") return "strong";
  if (signal === "good") return "good";
  if (signal === "weak") return "weak";
  if (signal === "unavailable") return "unavailable";
  return "medium";
}

function DiagnosticDetails({
  diagnostics,
  hook,
  t,
}: {
  diagnostics: ReturnType<typeof diagnoseYoutubeVideo>;
  hook: YoutubeTableSignal;
  t: ReturnType<typeof useTranslations>;
}) {
  const details = [
    ...diagnostics.map((diagnostic) => ({
      label: t(`axis.${diagnostic.axis}`),
      level: diagnostic.level,
    })),
    { label: t("axis.hook"), level: diagnosticLevelFromSignal(hook) },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("diagnosticDetails")}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <p className="text-xs font-bold">{t("diagnosticDetails")}</p>
        <dl className="mt-2 space-y-1.5 text-xs">
          {details.map((detail) => (
            <div key={detail.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className={cn("font-bold", DIAGNOSTIC_LEVEL_CLASS[detail.level])}>{t(`level.${detail.level}`)}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function DiagnosticSummary({
  video,
  bookings,
  revenueEur,
  metricComparisons,
  t,
}: {
  video: YoutubeVideoInsightRow;
  bookings: number | null;
  revenueEur: number | null;
  metricComparisons: YoutubeMetricComparisons;
  t: ReturnType<typeof useTranslations>;
}) {
  const viewsComparison = metricComparisons.views.get(video.videoId);
  const impressionsComparison = metricComparisons.impressions.get(video.videoId);
  const clickComparison = metricComparisons.ctr.get(video.videoId);
  const retention30Comparison = metricComparisons.retention30.get(video.videoId);
  const retentionComparison = metricComparisons.retention.get(video.videoId);
  const revenueValue = revenuePerThousandViews(revenueEur, video.views);
  const bookingsValue = bookingsPerThousandViews(bookings, video.views);
  const businessComparison = revenueValue !== null
    ? metricComparisons.revenuePer1000.get(video.videoId)
    : metricComparisons.bookingsPer1000.get(video.videoId);
  const retention30 = video.retentionCurve && video.durationSeconds && (video.views ?? 0) >= LOW_SAMPLE_VIEWS ? retentionAtThirty(video) : null;
  const growthValue = subscribersPerThousandViews(video);
  const performance = tableSignalFromComparison(video.views, viewsComparison ?? null);
  const diffusion = tableSignalFromComparison(video.impressions, impressionsComparison ?? null);
  const click = tableSignalFromComparison(video.impressionsClickThroughRate, clickComparison ?? null);
  const hook = tableSignalFromComparison(retention30, retention30Comparison ?? null);
  const retention = tableSignalFromComparison(video.averageViewPercentage, retentionComparison ?? null);
  const growth = tableSignalFromComparison(growthValue, metricComparisons.subsPer1000.get(video.videoId) ?? null);
  const business = tableSignalFromComparison(revenueValue ?? bookingsValue, businessComparison ?? null);
  const summary = summarizeYoutubeTableRow({ performance, diffusion, click, hook, retention, growth, business });
  const diagnostics = diagnoseYoutubeVideo({
    video,
    baselineViews: viewsComparison?.baseline ?? null,
    baselineImpressions: impressionsComparison?.baseline ?? null,
    baselineClick: clickComparison?.baseline ?? null,
    baselineRetention: retentionComparison?.baseline ?? null,
    businessValue: revenueValue ?? bookingsValue,
    businessBaseline: businessComparison?.baseline ?? null,
    bookings,
    revenueEur,
  });
  return (
    <div className="flex min-w-0 items-start gap-1" role="group" aria-label={t("diagnosisLabel")}>
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DIAGNOSTIC_DOT_CLASS[summary.tone])} aria-hidden="true" />
      <span className={cn("min-w-0 text-xs font-bold leading-tight", DIAGNOSTIC_TONE_CLASS[summary.tone])}>{t(`diagnosis.${summary.key}`)}</span>
      <DiagnosticDetails diagnostics={diagnostics} hook={hook} t={t} />
    </div>
  );
}

function ColumnSelector({
  columns,
  onChange,
  t,
}: {
  columns: ColumnKey[];
  onChange: (columns: ColumnKey[]) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState(columns);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setDraftColumns(columns);
    setOpen(nextOpen);
  }

  function toggle(column: ColumnKey) {
    if (isPrimaryColumn(column)) return;
    setDraftColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column]);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        {t("columns")}
      </Button>
      <DialogContent className="max-w-md max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:p-5">
        <DialogTitle>{t("columnsTitle")}</DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">{t("columnsHelp")}</p>
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("alwaysVisible")}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {ALWAYS_VISIBLE_COLUMNS.map((column) => (
                <label key={column} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm">
                  <input type="checkbox" checked readOnly disabled className="size-4 accent-(--state-healthy)" />
                  <span>{t(`column.${column}`)}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("optionalColumns")}</p>
            <div className="mt-3 space-y-4">
              {OPTIONAL_COLUMN_GROUPS.map((group) => (
                <fieldset key={group.key}>
                  <legend className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t(`columnGroup.${group.key}`)}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {group.columns.map((column) => (
                      <label key={column} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={draftColumns.includes(column)}
                          onChange={() => toggle(column)}
                          className="size-4 accent-(--accent)"
                        />
                        <span>{t(`column.${column}`)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t("columnsMemoryNote")}</p>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button type="button" variant="default" className="flex-1" onClick={() => { onChange(draftColumns); setOpen(false); }}>{t("apply")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TopVideosPanel({ videos, format }: { videos: YoutubeVideoInsightRow[]; format: VideoFormat }) {
  const locale = useLocale();
  const t = useTranslations("content.youtubeAnalytics");
  const numberFormat = new Intl.NumberFormat(locale);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  if (videos.length === 0) return null;

  return (
    <section className="sticker-card p-5 sm:p-6" aria-labelledby="youtube-top-videos-title">
      <div className="flex items-center gap-1.5">
        <h2 id="youtube-top-videos-title" className="text-base font-bold">{t("topVideos")}</h2>
        <InfoPopover text={t("topVideosHelp")} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("topVideosSub", { format: format === "all" ? t("allFormats") : format === "short" ? t("shorts") : t("longVideos") })}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {videos.map((video, index) => (
          <div key={video.id} className={cn("rounded-[var(--radius-control)] border p-4", index === 0 ? "border-accent-border bg-accent-soft" : "border-border")}>
            <Link href={`/acquisition/contenu/youtube/videos/${encodeURIComponent(video.videoId)}`} className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", index === 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                {index + 1}
              </span>
              <VideoThumbnail thumbnailUrl={video.thumbnailUrl} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{video.title}</span>
                <span className="block text-xs text-muted-foreground">{dateFormat.format(video.publishedAt)}</span>
              </span>
            </Link>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="font-display text-xl font-bold tabular-nums">
                {numberFormat.format(video.views ?? 0)} <span className="font-sans text-xs font-bold text-muted-foreground">{t("viewsShort")}</span>
              </p>
              <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer" aria-label={t("viewOnYoutube")} className="rounded-[var(--radius-control)] p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function YoutubeVideosTable({
  videos,
  commercialStats,
  snapshots,
  bingeMetrics,
  lastSyncAt,
  period,
  format,
}: {
  videos: YoutubeVideoInsightRow[];
  commercialStats: Map<string, { bookings: number | null; dealsClosed: number | null; revenueEur?: number | null; salesCount?: number | null }>;
  snapshots: Map<string, YoutubeVideoSnapshotRow[]>;
  bingeMetrics: Map<string, YoutubeVideoBingeMetrics>;
  lastSyncAt: Date | null;
  period: DateFilterKey;
  format: VideoFormat;
}) {
  const locale = useLocale();
  const t = useTranslations("content.youtubeAnalytics");
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const router = useRouter();
  const formatFiltered = useMemo(() => videos.filter((video) => matchesFormat(video, format)), [videos, format]);
  const topVideos = useMemo(() => computeTopVideos(formatFiltered), [formatFiltered]);
  const filteredVideos = useMemo(() => formatFiltered.filter((video) => isWithinPeriod(video.publishedAt, period)), [formatFiltered, period]);
  const comparisonValues = useMemo(() => {
    const values = {
      views: new Map<string, number | null>(),
      impressions: new Map<string, number | null>(),
      ctr: new Map<string, number | null>(),
      retention30: new Map<string, number | null>(),
      retention: new Map<string, number | null>(),
      subsPer1000: new Map<string, number | null>(),
      bookingsPer1000: new Map<string, number | null>(),
      revenuePer1000: new Map<string, number | null>(),
    };
    for (const video of formatFiltered) {
      const stats = commercialStats.get(video.videoId);
      const retention30 = video.retentionCurve && video.durationSeconds && (video.views ?? 0) >= LOW_SAMPLE_VIEWS ? retentionAtThirty(video) : null;
      values.views.set(video.videoId, video.views);
      values.impressions.set(video.videoId, video.impressions);
      values.ctr.set(video.videoId, video.impressionsClickThroughRate);
      values.retention30.set(video.videoId, retention30 === null ? null : retention30 * 100);
      values.retention.set(video.videoId, video.averageViewPercentage);
      values.subsPer1000.set(video.videoId, subscribersPerThousandViews(video));
      values.bookingsPer1000.set(video.videoId, bookingsPerThousandViews(stats?.bookings ?? null, video.views));
      values.revenuePer1000.set(video.videoId, revenuePerThousandViews(stats?.revenueEur ?? null, video.views));
    }
    return values;
  }, [commercialStats, formatFiltered]);
  const metricComparisons = useMemo(() => ({
    views: computeVideoMetricComparisons(formatFiltered, comparisonValues.views),
    impressions: computeVideoMetricComparisons(formatFiltered, comparisonValues.impressions),
    ctr: computeVideoMetricComparisons(formatFiltered, comparisonValues.ctr),
    retention30: computeVideoMetricComparisons(formatFiltered, comparisonValues.retention30),
    retention: computeVideoMetricComparisons(formatFiltered, comparisonValues.retention),
    subsPer1000: computeVideoMetricComparisons(formatFiltered, comparisonValues.subsPer1000),
    bookingsPer1000: computeVideoMetricComparisons(formatFiltered, comparisonValues.bookingsPer1000),
    revenuePer1000: computeVideoMetricComparisons(formatFiltered, comparisonValues.revenuePer1000),
  }), [comparisonValues, formatFiltered]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
      if (Array.isArray(stored)) {
        const valid = stored.filter((value): value is ColumnKey => typeof value === "string" && ALL_COLUMNS.includes(value as ColumnKey));
        setColumns([...new Set([...DEFAULT_COLUMNS, ...valid.filter((value) => !isPrimaryColumn(value))])]);
      }
    } catch {
      // An invalid local preference falls back to the product defaults.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  }, [columns]);

  useEffect(() => setPage(1), [period, format]);

  const sorted = useMemo(() => {
    const arr = [...filteredVideos];
    arr.sort((a, b) => {
      const valueOf = (video: YoutubeVideoInsightRow): number => {
        if (sortKey === "publishedAt") return video.publishedAt.getTime();
        if (sortKey === "views") return video.views ?? -1;
        return comparisonMetric(video) ?? -1;
      };
      const diff = valueOf(a) - valueOf(b);
      return sortDesc ? -diff : diff;
    });
    return arr;
  }, [filteredVideos, sortKey, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [sorted, safePage]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((previous) => !previous);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function goToVideo(videoId: string) {
    router.push(`/acquisition/contenu/youtube/videos/${encodeURIComponent(videoId)}`);
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, videoId: string) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, a")) return;
    goToVideo(videoId);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, videoId: string) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goToVideo(videoId);
    }
  }

  function statsFor(video: YoutubeVideoInsightRow) {
    const stats = commercialStats.get(video.videoId);
    return { bookings: stats?.bookings ?? null, dealsClosed: stats?.dealsClosed ?? null, revenueEur: stats?.revenueEur ?? null, salesCount: stats?.salesCount ?? null };
  }

  function analysisFor(video: YoutubeVideoInsightRow) {
    const stats = statsFor(video);
    const retention30 = video.retentionCurve && video.durationSeconds && (video.views ?? 0) >= LOW_SAMPLE_VIEWS ? retentionAtThirty(video) : null;
    const revenueValue = revenuePerThousandViews(stats.revenueEur, video.views);
    const bookingsValue = bookingsPerThousandViews(stats.bookings, video.views);
    const businessComparison = revenueValue !== null
      ? metricComparisons.revenuePer1000.get(video.videoId) ?? null
      : metricComparisons.bookingsPer1000.get(video.videoId) ?? null;
    const growthValue = subscribersPerThousandViews(video);
    const performanceStatus = tableSignalFromComparison(video.views, metricComparisons.views.get(video.videoId) ?? null);
    const diffusionStatus = tableSignalFromComparison(video.impressions, metricComparisons.impressions.get(video.videoId) ?? null);
    const clickStatus = tableSignalFromComparison(video.impressionsClickThroughRate, metricComparisons.ctr.get(video.videoId) ?? null);
    const hookStatus = tableSignalFromComparison(retention30 === null ? null : retention30 * 100, metricComparisons.retention30.get(video.videoId) ?? null);
    const retentionStatus = tableSignalFromComparison(
      video.averageViewPercentage ?? (retention30 === null ? null : retention30 * 100),
      metricComparisons.retention.get(video.videoId) ?? metricComparisons.retention30.get(video.videoId) ?? null,
    );
    const growthStatus = tableSignalFromComparison(growthValue, metricComparisons.subsPer1000.get(video.videoId) ?? null);
    const businessStatus = tableSignalFromComparison(revenueValue ?? bookingsValue, businessComparison);
    const diagnosis = summarizeYoutubeTableRow({
      performance: performanceStatus,
      diffusion: diffusionStatus,
      click: clickStatus,
      hook: hookStatus,
      retention: retentionStatus,
      growth: growthStatus,
      business: businessStatus,
    });
    return {
      stats,
      retention30,
      revenueValue,
      bookingsValue,
      growthValue,
      performanceStatus,
      diffusionStatus,
      clickStatus,
      hookStatus,
      retentionStatus,
      growthStatus,
      businessStatus,
      diagnosis,
      comparisons: {
        views: metricComparisons.views.get(video.videoId) ?? null,
        impressions: metricComparisons.impressions.get(video.videoId) ?? null,
        ctr: metricComparisons.ctr.get(video.videoId) ?? null,
        retention30: metricComparisons.retention30.get(video.videoId) ?? null,
        retention: metricComparisons.retention.get(video.videoId) ?? null,
        subsPer1000: metricComparisons.subsPer1000.get(video.videoId) ?? null,
        business: businessComparison,
      },
    };
  }

  function freshnessLabel(): string {
    if (!lastSyncAt) return t("dataUnavailable");
    const hours = Math.max(1, Math.round((Date.now() - lastSyncAt.getTime()) / 3_600_000));
    return t("freshness", { hours });
  }

  function cellValue(video: YoutubeVideoInsightRow, column: OptionalColumnKey): string {
    const stats = statsFor(video);
    const videoSnapshots = snapshots.get(video.videoId) ?? [];
    if (column === "impressions") return formatNumber(video.impressions, locale);
    if (column === "ctr") return formatPercent(video.impressionsClickThroughRate, locale);
    if (column === "browse" || column === "suggested" || column === "search") {
      const source = column === "browse" ? "BROWSE" : column === "suggested" ? "RELATED_VIDEO" : "YT_SEARCH";
      const share = aggregateTrafficSources([video]).find((item) => item.source === source)?.share ?? null;
      return formatPercent(share === null ? null : share * 100, locale);
    }
    if (column === "avgDuration") return formatDurationSeconds(video.averageViewDurationSeconds);
    if (column === "watchTime") return video.estimatedMinutesWatched === null ? "—" : `${formatNumber(video.estimatedMinutesWatched, locale)} ${t("minutes")}`;
    if (column === "likes") return formatNumber(video.likes, locale);
    if (column === "comments") return formatNumber(video.comments, locale);
    if (column === "shares") return formatNumber(video.shares, locale);
    if (column === "subsGained") return formatNumber(video.subscribersGained, locale);
    if (column === "subsLost") return formatNumber(video.subscribersLost, locale);
    if (column === "velocity1") return formatNumber(velocityAtDay(videoSnapshots, video.publishedAt, 1), locale);
    if (column === "velocity2") return formatNumber(velocityAtDay(videoSnapshots, video.publishedAt, 2), locale);
    if (column === "velocity7") return formatNumber(velocityAtDay(videoSnapshots, video.publishedAt, 7), locale);
    if (column === "endScreenCtr") return formatPercent(bingeMetrics.get(video.videoId)?.endScreenCtr ?? null, locale);
    if (column === "cardCtr") return formatPercent(bingeMetrics.get(video.videoId)?.cardCtr ?? null, locale);
    if (column === "revenuePer1000") return formatCurrency(revenuePerThousandViews(stats.revenueEur, video.views), locale);
    return "—";
  }

  function renderPrimaryColumn(video: YoutubeVideoInsightRow, column: PrimaryColumnKey, mode: "desktop" | "mobile" = "desktop"): ReactNode {
    const compact = mode === "desktop";
    const showHelp = mode === "mobile";
    const analysis = analysisFor(video);
    const retentionComparison = analysis.comparisons.retention ?? analysis.comparisons.retention30;
    const retentionAverage = formatPercent(video.averageViewPercentage, locale);
    const retentionValue = analysis.retention30 !== null
      ? t("retentionAtThirtyShort", { value: formatPercent(analysis.retention30 * 100, locale) })
      : video.averageViewPercentage === null
        ? "—"
        : t("retentionAverageShort", { value: retentionAverage });
    const retentionSecondary = analysis.retention30 !== null && video.averageViewPercentage !== null
      ? t("retentionAverageShort", { value: retentionAverage })
      : undefined;
    const net = netSubscribers(video);
    const growthValue = analysis.growthValue === null ? "—" : `${formatNumberValue(analysis.growthValue, locale)} / 1 000`;
    const growthSecondary = net === null ? undefined : `${net > 0 ? "+" : ""}${formatNumber(net, locale)} ${t("subscribersShort")}`;
    const hasBusinessData = analysis.stats.bookings !== null || analysis.stats.revenueEur !== null;
    const businessValue = hasBusinessData
      ? analysis.stats.bookings === null
        ? "—"
        : `${formatNumber(analysis.stats.bookings, locale)} ${t("bookingsShort")}`
      : t("notTracked");
    const businessSecondary = hasBusinessData && analysis.stats.revenueEur !== null
      ? formatCurrency(analysis.stats.revenueEur, locale)
      : undefined;

    if (column === "performance") {
      return <MetricBlock label={t("column.performance")} value={video.views === null ? "—" : `${formatNumber(video.views, locale)} ${t("viewsShort")}`} status={analysis.performanceStatus} comparison={analysis.comparisons.views} compact={compact} t={t} />;
    }
    if (column === "diffusion") {
      return <MetricBlock label={t("column.diffusion")} value={video.impressions === null ? "—" : `${formatNumber(video.impressions, locale)} ${t("impressionsShort")}`} status={analysis.diffusionStatus} comparison={analysis.comparisons.impressions} help={showHelp ? t("diffusionHelp") : undefined} compact={compact} t={t} />;
    }
    if (column === "click") {
      return <MetricBlock label={t("column.click")} value={formatPercent(video.impressionsClickThroughRate, locale)} status={analysis.clickStatus} comparison={analysis.comparisons.ctr} help={showHelp ? t("clickHelp") : undefined} compact={compact} t={t} />;
    }
    if (column === "retention") {
      return <MetricBlock label={t("column.retention")} value={retentionValue} secondary={retentionSecondary} status={analysis.retentionStatus} comparison={retentionComparison} help={showHelp ? t("retentionHelp") : undefined} compact={compact} t={t} />;
    }
    if (column === "growth") {
      return <MetricBlock label={t("column.growth")} value={growthValue} secondary={growthSecondary} status={analysis.growthStatus} comparison={analysis.comparisons.subsPer1000} help={showHelp ? t("growthHelp") : undefined} compact={compact} t={t} />;
    }
    if (column === "business") {
      return <MetricBlock label={t("column.business")} value={businessValue} secondary={businessSecondary} help={showHelp ? t("businessHelp") : undefined} compact={compact} t={t} />;
    }
    return (
      <DiagnosticSummary
        video={video}
        bookings={analysis.stats.bookings}
        revenueEur={analysis.stats.revenueEur}
        metricComparisons={metricComparisons}
        t={t}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TopVideosPanel videos={topVideos} format={format} />
      <section className="flex flex-col gap-3" aria-labelledby="youtube-videos-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="youtube-videos-title" className="text-xl font-bold">{t("tableTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("tableSubtitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("allVideos")} · {t("periodCount", { count: filteredVideos.length, plural: filteredVideos.length === 1 ? "" : "s" })}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground">{freshnessLabel()}</span>
            <ColumnSelector columns={columns} onChange={setColumns} t={t} />
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="sticker-card p-6">
            <p className="font-bold">{videos.length === 0 ? t("noVideos") : format !== "all" ? t("noFormat") : t("noPeriod")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{videos.length === 0 ? t("noVideosHelp") : format !== "all" ? t("noFormatHelp") : t("noPeriodHelp")}</p>
          </div>
        ) : (
          <>
            <div className="sticker-card hidden overflow-x-auto md:block">
              <table className="w-full min-w-[880px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[11.5rem]" />
                  {columns.map((column) => <col key={column} className={desktopColumnWidth(column)} />)}
                  <col className="w-12" />
                </colgroup>
                <thead className="border-b border-border bg-surface-sunken">
                  <tr className="text-left">
                    <th className="p-2" scope="col"><SortHeader label={t("videoDate")} sortKeyValue="publishedAt" /></th>
                    {columns.map((column) => (
                      <th key={column} className="p-2 text-right" scope="col">
                        <span className="inline-flex items-center justify-end gap-1 text-xs font-bold text-muted-foreground">
                          {t(`column.${column}`)}
                          {column === "diffusion" && <InfoPopover text={t("diffusionHelp")} ariaLabel={t("metricHelp")} />}
                          {column === "click" && <InfoPopover text={t("clickHelp")} ariaLabel={t("metricHelp")} />}
                          {column === "retention" && <InfoPopover text={t("retentionHelp")} ariaLabel={t("metricHelp")} />}
                          {column === "growth" && <InfoPopover text={t("growthHelp")} ariaLabel={t("metricHelp")} />}
                          {column === "business" && <InfoPopover text={t("businessHelp")} ariaLabel={t("metricHelp")} />}
                        </span>
                      </th>
                    ))}
                    <th className="p-2" scope="col"><span className="sr-only">{t("actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((video) => {
                    const lowSample = (video.views ?? 0) < LOW_SAMPLE_VIEWS;
                    return (
                      <tr
                        key={video.id}
                        tabIndex={0}
                        role="link"
                        aria-label={`${t("viewDetails")}: ${video.title}`}
                        onClick={(event) => handleRowClick(event, video.videoId)}
                        onKeyDown={(event) => handleRowKeyDown(event, video.videoId)}
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      >
                        <td className="p-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <VideoThumbnail thumbnailUrl={video.thumbnailUrl} />
                            <div className="min-w-0">
                              <p className="line-clamp-1 font-bold">{video.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{dateFormat.format(video.publishedAt)} · {formatDurationSeconds(video.durationSeconds)}</p>
                              {lowSample && <span className="mt-1 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{t("lowSample")}</span>}
                            </div>
                          </div>
                        </td>
                        {columns.map((column) => (
                          <td key={column} className={cn("p-2 align-top text-right tabular-nums", !isPrimaryColumn(column) && "text-muted-foreground")}>
                            {isPrimaryColumn(column) ? renderPrimaryColumn(video, column) : cellValue(video, column)}
                          </td>
                        ))}
                        <td className="p-2 text-right">
                          <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer" aria-label={`${t("viewOnYoutube")}: ${video.title}`} onClick={(event) => event.stopPropagation()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
                            <ExternalLink className="size-4" aria-hidden="true" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">{t("diagnosisHelp")}</p>

            <div className="grid gap-3 md:hidden">
              {paged.map((video) => {
                const lowSample = (video.views ?? 0) < LOW_SAMPLE_VIEWS;
                return (
                  <article
                    key={video.id}
                    className="rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
                  >
                    <div className="flex items-start gap-3">
                      <VideoThumbnail thumbnailUrl={video.thumbnailUrl} />
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 font-bold">{video.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{dateFormat.format(video.publishedAt)} · {formatDurationSeconds(video.durationSeconds)}</p>
                        {lowSample && <span className="mt-1 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{t("lowSample")}</span>}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
                      {DEFAULT_COLUMNS.filter((column) => column !== "diagnosis").map((column) => (
                        <div key={column} className="min-w-0 rounded-[var(--radius-control)] bg-muted/40 p-2.5">
                          {renderPrimaryColumn(video, column, "mobile")}
                        </div>
                      ))}
                      <div className="col-span-2 min-w-0 rounded-[var(--radius-control)] bg-muted/40 p-2.5">
                        {renderPrimaryColumn(video, "diagnosis")}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="default" size="sm" asChild className="flex-1 justify-center" onClick={(event) => event.stopPropagation()}>
                          <Link href={`/acquisition/contenu/youtube/videos/${encodeURIComponent(video.videoId)}`}>{t("viewDetails")}</Link>
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" asChild onClick={(event) => event.stopPropagation()}>
                          <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer" aria-label={`${t("viewOnYoutube")}: ${video.title}`}>
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
        <Pager page={safePage} totalPages={totalPages} onPageChange={setPage} />
      </section>
    </div>
  );

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const active = sortKey === sortKeyValue;
    return (
      <button type="button" onClick={() => toggleSort(sortKeyValue)} className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
        {label}
        {active ? (sortDesc ? <ArrowDown className="size-3" aria-hidden="true" /> : <ArrowUp className="size-3" aria-hidden="true" />) : <ChevronsUpDown className="size-3" aria-hidden="true" />}
        <span className="sr-only">{active ? (sortDesc ? t("sortedDescending") : t("sortedAscending")) : t("sortColumn")}</span>
      </button>
    );
  }
}

function formatNumberValue(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function retentionAtThirty(video: YoutubeVideoInsightRow): number | null {
  const curve = video.retentionCurve;
  if (!curve || !video.durationSeconds || video.durationSeconds <= 30) return null;
  const target = 30 / video.durationSeconds;
  const closest = curve.reduce((best, point) => (Math.abs(point.ratio - target) < Math.abs(best.ratio - target) ? point : best));
  return Math.min(1, closest.watchRatio);
}
