"use client";

import { useLocale, useTranslations } from "next-intl";

import { InfoPopover } from "@/components/info-popover";
import type { YoutubeChannelSearchTerm, YoutubeChannelTrafficSource } from "@/lib/youtube/channel-insights";
import { channelTrafficSourcesForFormat } from "@/lib/youtube/channel-insights";
import { type VideoFormat, matchesFormat } from "@/lib/youtube/format";
import {
  aggregateSearchTerms,
  aggregateTrafficSourceEntries,
  aggregateTrafficSources,
  averageHookRetention,
  dropOffSeconds,
  formatTimecode,
  hasUsableRetention,
  hookRetention,
  medianDropOffSeconds,
  topTrafficSources,
} from "@/lib/youtube/retention";
import { YOUTUBE_RETENTION_MIN_VIEWS } from "@/lib/youtube/protocol";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

type YoutubeHooksSectionProps = {
  videos: YoutubeVideoInsightRow[];
  channelTrafficSources?: YoutubeChannelTrafficSource[] | null;
  channelTrafficSourcesFetchedAt?: Date | null;
  channelSearchTerms?: YoutubeChannelSearchTerm[] | null;
  channelSearchTermsFetchedAt?: Date | null;
};

type MeasuredFormat = Exclude<VideoFormat, "all">;

const FORMAT_ORDER: MeasuredFormat[] = ["long", "short"];

export function YoutubeHooksSection({
  videos,
  channelTrafficSources = null,
  channelTrafficSourcesFetchedAt = null,
  channelSearchTerms = null,
  channelSearchTermsFetchedAt = null,
}: YoutubeHooksSectionProps) {
  const t = useTranslations("content.youtube");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="youtube-behavior-title">
        <h2 id="youtube-behavior-title" className="text-base font-bold">
          {t("hooksTitle")}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {FORMAT_ORDER.map((format) => (
            <FormatBehaviorCard
              key={format}
              format={format}
              videos={videos}
              channelTrafficSources={channelTrafficSources}
              channelTrafficSourcesFetchedAt={channelTrafficSourcesFetchedAt}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="youtube-hooks-title">
        <h2 id="youtube-hooks-title" className="text-base font-bold">
          {t("hooks")}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {FORMAT_ORDER.map((format) => (
            <HookFormatCard key={format} format={format} videos={videos} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="youtube-traffic-title">
        <div className="flex items-center gap-1.5">
          <h2 id="youtube-traffic-title" className="text-base font-bold">
            {t("trafficOrigin")}
          </h2>
          <InfoPopover text={t("trafficHelp")} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {FORMAT_ORDER.map((format) => (
            <TrafficFormatCard
              key={format}
              format={format}
              videos={videos}
              channelTrafficSources={channelTrafficSources}
              channelTrafficSourcesFetchedAt={channelTrafficSourcesFetchedAt}
            />
          ))}
        </div>
      </section>

      <SearchTermsCard
        videos={videos}
        channelSearchTerms={channelSearchTerms}
        channelSearchTermsFetchedAt={channelSearchTermsFetchedAt}
      />
    </div>
  );
}

function FormatBehaviorCard({
  format,
  videos,
  channelTrafficSources,
  channelTrafficSourcesFetchedAt,
}: {
  format: MeasuredFormat;
  videos: YoutubeVideoInsightRow[];
  channelTrafficSources: YoutubeChannelTrafficSource[] | null;
  channelTrafficSourcesFetchedAt: Date | null | undefined;
}) {
  const locale = useLocale();
  const t = useTranslations("content.youtube");
  const analyticsT = useTranslations("content.youtubeAnalytics");
  const numberFormat = new Intl.NumberFormat(locale);
  const formatVideos = videos.filter((video) => matchesFormat(video, format));
  const measurable = formatVideos.filter(hasUsableRetention);
  const hookSeconds = format === "short" ? 3 : 30;
  const medianDropOff = medianDropOffSeconds(measurable);
  const averageHook = averageHookRetention(measurable, hookSeconds);
  const imported = formatVideos.filter(
    (video) => (video.views ?? 0) >= YOUTUBE_RETENTION_MIN_VIEWS && video.averageViewPercentage !== null
  );
  const importedAverage = imported.length > 0
    ? imported.reduce((sum, video) => sum + (video.averageViewPercentage ?? 0), 0) / imported.length
    : null;
  const displayedAverage = averageHook ?? (importedAverage === null ? null : importedAverage / 100);
  const hasChannelTraffic = channelTrafficSourcesFetchedAt !== null && channelTrafficSourcesFetchedAt !== undefined;
  const trafficSources = hasChannelTraffic
    ? aggregateTrafficSourceEntries(
        channelTrafficSourcesForFormat(channelTrafficSources ?? [], format).map(({ source, views }) => ({ source, views }))
      )
    : aggregateTrafficSources(measurable);
  const formatLabel = format === "short" ? t("shortFormat") : t("longFormat");

  return (
    <div className="sticker-card flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{formatLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("formatDataCount", { count: formatVideos.length, plural: formatVideos.length > 1 ? "s" : "" })}
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground">
          {format === "short" ? t("shortHook") : t("longHook")}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label={t("medianDropOff")}
          value={medianDropOff === null ? "—" : formatTimecode(medianDropOff)}
          note={medianDropOff === null ? t("notEnoughRetention") : medianDropOff < hookSeconds ? t("belowHook", { seconds: hookSeconds }) : t("afterHook")}
          help={t("medianDropOffHelp")}
        />
        <Metric
          label={t("retentionAt", { seconds: hookSeconds })}
          value={displayedAverage === null ? "—" : formatPercent(displayedAverage, numberFormat)}
          note={averageHook === null && importedAverage !== null
            ? t("importedAverage", { count: imported.length, plural: imported.length > 1 ? "s" : "" })
            : t("measurableAverage")}
          help={t("retentionAtHelp", { seconds: hookSeconds })}
        />
        <Metric
          label={t("firstTrafficSource")}
          value={trafficSources[0] ? analyticsT(`traffic.${trafficSources[0].source}`) : "—"}
          note={trafficSources[0] ? `${formatPercent(trafficSources[0].share, numberFormat)} ${t("measuredViews")}` : t("noTrafficData")}
        />
      </div>

      {averageHook === null && importedAverage !== null && (
        <p className="text-xs text-muted-foreground">
          {t("importedRetentionNote", { value: formatPercent(importedAverage / 100, numberFormat) })}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {hasChannelTraffic
          ? t("channelTrafficScope", { date: formatDate(channelTrafficSourcesFetchedAt, locale) })
          : t("legacyTrafficScope", { count: measurable.length, plural: measurable.length > 1 ? "s" : "" })}
      </p>
    </div>
  );
}

function HookFormatCard({ format, videos }: { format: MeasuredFormat; videos: YoutubeVideoInsightRow[] }) {
  const locale = useLocale();
  const t = useTranslations("content.youtube");
  const formatVideos = videos.filter((video) => matchesFormat(video, format));
  const measurable = formatVideos.filter(hasUsableRetention);
  const hookSeconds = format === "short" ? 3 : 30;
  const withHook = measurable
    .map((video) => ({ video, hook: hookRetention(video, hookSeconds) }))
    .filter((entry): entry is { video: YoutubeVideoInsightRow; hook: number } => entry.hook !== null)
    .sort((a, b) => b.hook - a.hook);
  const bestHook = withHook[0];
  const worstHook = withHook.length > 1 ? withHook[withHook.length - 1] : null;
  const formatLabel = format === "short" ? t("shortFormat") : t("longFormat");

  return (
    <div className="sticker-card flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold">{formatLabel}</p>
        <p className="text-xs text-muted-foreground">
          {t("enoughData", { count: measurable.length, plural: measurable.length > 1 ? "s" : "" })}
        </p>
      </div>
      {bestHook ? (
        <div className="flex flex-col gap-2">
          <HookRow label={t("bestHook")} video={bestHook.video} hook={bestHook.hook} hookSeconds={hookSeconds} tone="healthy" />
          {worstHook && <HookRow label={t("toImprove")} video={worstHook.video} hook={worstHook.hook} hookSeconds={hookSeconds} tone="critical" />}
          {worstHook && (
            <p className="text-xs text-muted-foreground">
              {t("hookGap", {
                value: formatPercent(bestHook.hook - worstHook.hook, new Intl.NumberFormat(locale)),
                seconds: hookSeconds,
                title: bestHook.video.title,
              })}
            </p>
          )}
        </div>
      ) : (
        <div className="sticker-card-dashed p-4 text-center">
          <p className="text-sm font-bold">{t("notEnoughRetention")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("retentionHelp", { views: new Intl.NumberFormat(locale).format(YOUTUBE_RETENTION_MIN_VIEWS) })}</p>
        </div>
      )}
    </div>
  );
}

function TrafficFormatCard({
  format,
  videos,
  channelTrafficSources,
  channelTrafficSourcesFetchedAt,
}: {
  format: MeasuredFormat;
  videos: YoutubeVideoInsightRow[];
  channelTrafficSources: YoutubeChannelTrafficSource[] | null;
  channelTrafficSourcesFetchedAt: Date | null | undefined;
}) {
  const locale = useLocale();
  const t = useTranslations("content.youtube");
  const analyticsT = useTranslations("content.youtubeAnalytics");
  const formatVideos = videos.filter((video) => matchesFormat(video, format));
  const measurable = formatVideos.filter(hasUsableRetention);
  const hasChannelTraffic = channelTrafficSourcesFetchedAt !== null && channelTrafficSourcesFetchedAt !== undefined;
  const sources = hasChannelTraffic
    ? aggregateTrafficSourceEntries(
        channelTrafficSourcesForFormat(channelTrafficSources ?? [], format).map(({ source, views }) => ({ source, views }))
      )
    : aggregateTrafficSources(measurable);
  const visibleSources = topTrafficSources(sources);
  const formatLabel = format === "short" ? t("shortFormat") : t("longFormat");
  const numberFormat = new Intl.NumberFormat(locale);

  return (
    <div className="sticker-card flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold">{formatLabel}</p>
        <p className="text-xs text-muted-foreground">{t("trafficTotal")}</p>
      </div>
      {visibleSources.length > 0 ? (
        <div className="flex flex-col gap-2">
          {visibleSources.map((source) => (
            <div key={source.source} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-bold">{analyticsT(`traffic.${source.source}`)}</span>
                <span className="tabular-nums text-muted-foreground">{numberFormat.format(Math.round(source.share * 100))}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(source.share * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sticker-card-dashed p-4 text-center">
          <p className="text-sm font-bold">{t("noTrafficData")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("trafficDataHelp")}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {hasChannelTraffic
          ? t("channelTrafficScope", { date: formatDate(channelTrafficSourcesFetchedAt, locale) })
          : t("legacyTrafficScope", { count: measurable.length, plural: measurable.length > 1 ? "s" : "" })}
      </p>
    </div>
  );
}

function SearchTermsCard({
  videos,
  channelSearchTerms,
  channelSearchTermsFetchedAt,
}: {
  videos: YoutubeVideoInsightRow[];
  channelSearchTerms: YoutubeChannelSearchTerm[] | null;
  channelSearchTermsFetchedAt: Date | null | undefined;
}) {
  const locale = useLocale();
  const t = useTranslations("content.youtube");
  const numberFormat = new Intl.NumberFormat(locale);
  const measurable = videos.filter(hasUsableRetention);
  const hasChannelSearch = channelSearchTermsFetchedAt !== null && channelSearchTermsFetchedAt !== undefined;
  const terms = hasChannelSearch ? (channelSearchTerms ?? []).slice(0, 8) : aggregateSearchTerms(measurable);

  return (
    <section className="sticker-card flex flex-col gap-3 p-5" aria-labelledby="youtube-search-title">
      <div className="flex items-center gap-1.5">
        <h2 id="youtube-search-title" className="text-base font-bold">
          {t("searchTerms")}
        </h2>
        <InfoPopover text={t("searchHelp")} />
      </div>
      {terms.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {terms.map((term) => (
            <span key={term.term} className="rounded-full border border-border px-3 py-1 text-sm font-bold" title={`${numberFormat.format(term.views)} ${t("viewsShort")}`}>
              {term.term}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{numberFormat.format(term.views)}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="sticker-card-dashed p-4 text-center">
          <p className="text-sm font-bold">{t("noSearchData")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("searchDataHelp")}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {hasChannelSearch
          ? t("channelSearchScope", { date: formatDate(channelSearchTermsFetchedAt, locale) })
          : t("legacySearchScope", { count: measurable.length, plural: measurable.length > 1 ? "s" : "" })}
      </p>
    </section>
  );
}

function Metric({ label, value, note, help }: { label: string; value: string; note: string; help?: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold text-muted-foreground">{label}</p>
        {help && <InfoPopover text={help} />}
      </div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function HookRow({
  label,
  video,
  hook,
  hookSeconds,
  tone,
}: {
  label: string;
  video: YoutubeVideoInsightRow;
  hook: number;
  hookSeconds: number;
  tone: "healthy" | "critical";
}) {
  const locale = useLocale();
  const t = useTranslations("content.youtube");
  const drop = dropOffSeconds(video);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border p-3">
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
        <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer" className="line-clamp-1 font-bold hover:underline">
          {video.title}
        </a>
        {drop !== null && <p className="text-xs text-muted-foreground">{t("dropAt", { time: formatTimecode(drop) })}</p>}
        <p className="text-xs text-muted-foreground">{t("hookMeasuredAt", { seconds: hookSeconds })}</p>
      </div>
      <p className={`shrink-0 font-display text-2xl font-bold tabular-nums ${tone === "healthy" ? "text-state-healthy" : "text-state-critical"}`}>
        {formatPercent(hook, new Intl.NumberFormat(locale))}
      </p>
    </div>
  );
}

function formatPercent(value: number, numberFormat: Intl.NumberFormat): string {
  return `${numberFormat.format(Math.round(value * 100))}%`;
}

function formatDate(value: Date | null | undefined, locale: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(value);
}
