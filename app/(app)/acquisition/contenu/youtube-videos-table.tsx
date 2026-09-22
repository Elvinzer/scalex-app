"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, MonitorPlay, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { InfoPopover } from "@/components/info-popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatDurationSeconds } from "@/components/youtube/youtube-video-detail-dialog";
import { type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import { diagnoseYoutubeVideo, type YoutubeDiagnosticLevel } from "@/lib/youtube/diagnosis";
import { type VideoFormat, matchesFormat } from "@/lib/youtube/format";
import { comparisonMetric, computeVideoMetricComparisons, type VideoPerformanceComparison } from "@/lib/youtube/insights-comparison";
import { aggregateTrafficSources } from "@/lib/youtube/retention";
import { bookingsPerThousandViews, revenuePerThousandViews, subscribersPerThousandViews } from "@/lib/youtube/rates";
import type { YoutubeVideoBingeMetrics, YoutubeVideoInsightRow, YoutubeVideoSnapshotRow } from "@/lib/youtube/queries";
import { cn } from "@/lib/utils";

import { Pager } from "./pager";

type SortKey = "publishedAt" | "views" | "retention";
type ColumnKey =
  | "views"
  | "retention30"
  | "retention"
  | "subsPer1000"
  | "bookings"
  | "revenue"
  | "diagnosis"
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

const PAGE_SIZE = 10;
const LOW_SAMPLE_VIEWS = 100;
const DEFAULT_COLUMNS: ColumnKey[] = ["views", "retention30", "retention", "subsPer1000", "bookings", "revenue", "diagnosis"];
const ALWAYS_VISIBLE_COLUMNS: ColumnKey[] = ["views", "retention30", "retention", "subsPer1000", "bookings", "revenue", "diagnosis"];
const OPTIONAL_COLUMNS: ColumnKey[] = [
  "impressions",
  "ctr",
  "browse",
  "suggested",
  "search",
  "avgDuration",
  "watchTime",
  "likes",
  "comments",
  "shares",
  "subsGained",
  "subsLost",
  "velocity1",
  "velocity2",
  "velocity7",
  "endScreenCtr",
  "cardCtr",
  "revenuePer1000",
];
const STORAGE_KEY = "minaly:youtube-table-columns:v1";

const TIER_TEXT_CLASS: Record<"above" | "inline" | "below", string> = {
  above: "text-state-healthy",
  inline: "text-foreground",
  below: "text-state-critical",
};

const DIAGNOSTIC_DOT_CLASS: Record<YoutubeDiagnosticLevel, string> = {
  strong: "bg-state-healthy",
  good: "bg-state-healthy/55",
  medium: "bg-state-caution",
  weak: "bg-state-critical",
  unavailable: "bg-state-unknown",
};

type YoutubeMetricComparisons = Record<
  "views" | "retention30" | "retention" | "subsPer1000" | "bookingsPer1000" | "revenuePer1000",
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

function DiagnosticDots({
  video,
  bookings,
  revenueEur,
  metricComparisons,
  videos,
  t,
}: {
  video: YoutubeVideoInsightRow;
  bookings: number | null;
  revenueEur: number | null;
  metricComparisons: YoutubeMetricComparisons;
  videos: YoutubeVideoInsightRow[];
  t: ReturnType<typeof useTranslations>;
}) {
  const viewsComparison = metricComparisons.views.get(video.videoId);
  const retentionComparison = metricComparisons.retention.get(video.videoId);
  const revenueValue = revenuePerThousandViews(revenueEur, video.views);
  const bookingsValue = bookingsPerThousandViews(bookings, video.views);
  const businessComparison = revenueValue !== null
    ? metricComparisons.revenuePer1000.get(video.videoId)
    : metricComparisons.bookingsPer1000.get(video.videoId);
  const diagnostics = diagnoseYoutubeVideo({
    video,
    baselineViews: viewsComparison?.baseline ?? null,
    baselineRetention: retentionComparison?.baseline ?? null,
    businessValue: revenueValue ?? bookingsValue,
    businessBaseline: businessComparison?.baseline ?? null,
    bookings,
    revenueEur,
  });
  return (
    <div className="flex items-center justify-end gap-1.5" role="group" aria-label={t("diagnosisLabel")}>
      {diagnostics.map((diagnostic) => (
        <span
          key={diagnostic.axis}
          className={cn("size-2 rounded-full", DIAGNOSTIC_DOT_CLASS[diagnostic.level])}
          role="img"
          aria-label={`${t(`axis.${diagnostic.axis}`)} : ${t(`level.${diagnostic.level}`)}`}
          title={`${t(`axis.${diagnostic.axis}`)} : ${t(`level.${diagnostic.level}`)}`}
        />
      ))}
      <span className="sr-only">{videos.length > 0 ? t("diagnosisHelp") : ""}</span>
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
    if (ALWAYS_VISIBLE_COLUMNS.includes(column)) return;
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
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {OPTIONAL_COLUMNS.map((column) => (
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
        const valid = stored.filter((value): value is ColumnKey => typeof value === "string" && DEFAULT_COLUMNS.concat(OPTIONAL_COLUMNS).includes(value as ColumnKey));
        setColumns([...new Set([...DEFAULT_COLUMNS, ...valid.filter((value) => !DEFAULT_COLUMNS.includes(value))])]);
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

  function comparisonFor(video: YoutubeVideoInsightRow, column: ColumnKey) {
    const metricByColumn: Partial<Record<ColumnKey, keyof typeof metricComparisons>> = {
      views: "views",
      retention30: "retention30",
      retention: "retention",
      subsPer1000: "subsPer1000",
      bookings: "bookingsPer1000",
      revenue: "revenuePer1000",
      revenuePer1000: "revenuePer1000",
    };
    const metric = metricByColumn[column];
    return metric ? metricComparisons[metric].get(video.videoId) ?? null : null;
  }

  function freshnessLabel(): string {
    if (!lastSyncAt) return t("dataUnavailable");
    const hours = Math.max(1, Math.round((Date.now() - lastSyncAt.getTime()) / 3_600_000));
    return t("freshness", { hours });
  }

  function cellValue(video: YoutubeVideoInsightRow, column: ColumnKey): string {
    const stats = statsFor(video);
    const videoSnapshots = snapshots.get(video.videoId) ?? [];
    if (column === "views") return formatNumber(video.views, locale);
    if (column === "retention30") {
      const value = video.retentionCurve && video.durationSeconds && video.views !== null && video.views >= LOW_SAMPLE_VIEWS ? retentionAtThirty(video) : null;
      return formatPercent(value === null ? null : value * 100, locale);
    }
    if (column === "retention") return formatPercent(video.averageViewPercentage, locale);
    if (column === "subsPer1000") return formatNumberValue(subscribersPerThousandViews(video), locale);
    if (column === "bookings") return formatNumber(stats.bookings, locale);
    if (column === "revenue") return formatCurrency(stats.revenueEur, locale);
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
    if (column === "revenuePer1000") return formatCurrency(stats.revenueEur === null || video.views === null || video.views <= 0 ? null : (stats.revenueEur / video.views) * 1000, locale);
    return "—";
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
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-border bg-surface-sunken">
                  <tr className="text-left">
                    <th className="p-3" scope="col"><SortHeader label={t("videoDate")} sortKeyValue="publishedAt" /></th>
                    {columns.map((column) => (
                      <th key={column} className="p-3 text-right" scope="col">
                        <span className="inline-flex items-center justify-end gap-1 text-xs font-bold text-muted-foreground">
                          {t(`column.${column}`)}
                          {column === "retention" && <InfoPopover text={t("retentionHelp")} />}
                        </span>
                      </th>
                    ))}
                    <th className="p-3" scope="col"><span className="sr-only">{t("actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((video) => {
                    const stats = statsFor(video);
                    const lowSample = (video.views ?? 0) < LOW_SAMPLE_VIEWS;
                    return (
                      <tr
                        key={video.id}
                        tabIndex={0}
                        role="link"
                        aria-label={`${t("viewDetails")}: ${video.title}`}
                        onClick={() => goToVideo(video.videoId)}
                        onKeyDown={(event) => handleRowKeyDown(event, video.videoId)}
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      >
                        <td className="p-3">
                          <div className="flex min-w-[15rem] items-center gap-3">
                            <VideoThumbnail thumbnailUrl={video.thumbnailUrl} />
                            <div className="min-w-0">
                              <p className="line-clamp-1 font-bold">{video.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{dateFormat.format(video.publishedAt)} · {formatDurationSeconds(video.durationSeconds)}</p>
                              {lowSample && <span className="mt-1 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{t("lowSample")}</span>}
                            </div>
                          </div>
                        </td>
                        {columns.map((column) => (
                          <td key={column} className={cn("p-3 text-right tabular-nums", ["impressions", "ctr", "browse", "suggested", "search", "avgDuration", "watchTime", "likes", "comments", "shares", "subsGained", "subsLost", "velocity1", "velocity2", "velocity7", "endScreenCtr", "cardCtr"].includes(column) && "text-muted-foreground")}>
                            {column === "diagnosis" ? <DiagnosticDots video={video} bookings={stats.bookings} revenueEur={stats.revenueEur} metricComparisons={metricComparisons} videos={formatFiltered} t={t} /> : <ComparisonValue value={cellValue(video, column)} comparison={comparisonFor(video, column)} t={t} />}
                          </td>
                        ))}
                        <td className="p-3 text-right">
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
                const stats = statsFor(video);
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
                    <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3">
                      <Metric label={t("column.views")} value={cellValue(video, "views")} />
                      <Metric label={t("column.retention")} value={cellValue(video, "retention")} />
                      <Metric label={t("column.revenue")} value={cellValue(video, "revenue")} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <DiagnosticDots video={video} bookings={stats.bookings} revenueEur={stats.revenueEur} metricComparisons={metricComparisons} videos={formatFiltered} t={t} />
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 truncate font-display text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ComparisonValue({
  value,
  comparison,
  t,
}: {
  value: string;
  comparison: VideoPerformanceComparison | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!comparison) return <span>{value}</span>;
  const delta = Math.round((comparison.ratio - 1) * 100);
  const deltaLabel = `${delta > 0 ? "+" : ""}${delta}`;
  return (
    <span className="inline-flex flex-col items-end">
      <span className={TIER_TEXT_CLASS[comparison.tier]} title={t("comparisonTitle", { count: comparison.cohortSize })}>{value}</span>
      <span className={cn("text-[10px] font-bold", TIER_TEXT_CLASS[comparison.tier])}>{t("comparisonDelta", { value: deltaLabel })}</span>
    </span>
  );
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
