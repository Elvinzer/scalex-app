"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { InfoPopover } from "@/components/info-popover";
import { type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import { type VideoFormat, matchesFormat } from "@/lib/youtube/format";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

import { FormatPills, PeriodPills } from "./period-pills";
import { YoutubeVideosTable } from "./youtube-videos-table";

// The data panel for YouTube. The parent shell owns the filters so switching
// platforms preserves the user's period and format choices.
export function YoutubeView({
  videos,
  commercialStats,
  subscriberCount,
  period,
  onPeriodChange,
  format,
  onFormatChange,
}: {
  videos: YoutubeVideoInsightRow[];
  commercialStats: Map<string, { bookings: number | null; dealsClosed: number | null }>;
  subscriberCount: number | null;
  period: DateFilterKey;
  onPeriodChange: (period: DateFilterKey) => void;
  format: VideoFormat;
  onFormatChange: (format: VideoFormat) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("content");
  const filtered = useMemo(
    () => videos.filter((video) => matchesFormat(video, format) && isWithinPeriod(video.publishedAt, period)),
    [videos, format, period]
  );
  const retentionValues = filtered.map((video) => video.averageViewPercentage).filter((value): value is number => value !== null);
  const avgRetention = retentionValues.length > 0 ? retentionValues.reduce((sum, value) => sum + value, 0) / retentionValues.length : null;
  // No CTR KPI — thumbnail impressions/CTR aren't retrievable via the
  // real-time YouTube Analytics API (see protocol.ts's
  // YOUTUBE_THUMBNAIL_CTR_AVAILABLE), so it's never a real number to average.
  const totalViews = filtered.reduce((sum, video) => sum + (video.views ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PeriodPills period={period} onChange={onPeriodChange} />
      <FormatPills format={format} onChange={onFormatChange} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("youtubeSubscribers")}</p>
          <p className="mt-2 font-display text-3xl font-bold">
            {subscriberCount === null ? "—" : new Intl.NumberFormat(locale).format(subscriberCount)}
          </p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-muted-foreground">{t("youtubeRetention")}</p>
            <InfoPopover text={t("youtubeRetentionHelp")} />
          </div>
          <p className="mt-2 font-display text-3xl font-bold">{avgRetention === null ? "—" : `${Math.round(avgRetention * 10) / 10}%`}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("youtubeViews")}</p>
          <p className="mt-2 font-display text-3xl font-bold">{new Intl.NumberFormat(locale).format(totalViews)}</p>
        </div>
      </div>

      <YoutubeVideosTable videos={videos} commercialStats={commercialStats} period={period} format={format} />
    </div>
  );
}
