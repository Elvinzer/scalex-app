"use client";

import { useMemo, useState } from "react";

import { InfoPopover } from "@/components/info-popover";
import { type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import { type VideoFormat, matchesFormat } from "@/lib/youtube/format";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

import { FormatPills, PeriodPills } from "./period-pills";
import { YoutubeVideosTable } from "./youtube-videos-table";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

// The interactive half of /acquisition/contenu/youtube. `videos` arrives
// already filtered to public uploads by the page (see isPublicVideo) — no
// private/unlisted video reaches this component at all, so nothing here
// needs to re-check it.
export function YoutubeView({
  videos,
  commercialStats,
  subscriberCount,
}: {
  videos: YoutubeVideoInsightRow[];
  commercialStats: Map<string, { bookings: number | null; dealsClosed: number | null }>;
  subscriberCount: number | null;
}) {
  const [period, setPeriod] = useState<DateFilterKey>("all");
  const [format, setFormat] = useState<VideoFormat>("all");

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
      <PeriodPills period={period} onChange={setPeriod} />
      <FormatPills format={format} onChange={setFormat} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Abonnés</p>
          <p className="mt-2 font-display text-3xl font-bold">
            {subscriberCount === null ? "—" : NUMBER_FORMAT.format(subscriberCount)}
          </p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-muted-foreground">Rétention moyenne</p>
            <InfoPopover text="Pourcentage moyen de tes vidéos regardé par les spectateurs, sur la période et le format sélectionnés — le signal que YouTube utilise pour juger si une vidéo mérite d'être recommandée." />
          </div>
          <p className="mt-2 font-display text-3xl font-bold">{avgRetention === null ? "—" : `${Math.round(avgRetention * 10) / 10}%`}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Vues sur la période</p>
          <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(totalViews)}</p>
        </div>
      </div>

      <YoutubeVideosTable videos={videos} commercialStats={commercialStats} period={period} format={format} />
    </div>
  );
}
