"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, MonitorPlay } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InfoPopover } from "@/components/info-popover";
import { Button } from "@/components/ui/button";
import { YoutubeVideoDetailDialog } from "@/components/youtube/youtube-video-detail-dialog";
import { type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import { VIDEO_FORMATS, type VideoFormat, matchesFormat } from "@/lib/youtube/format";
import { comparisonMetric, computeVideoPerformanceComparisons, type VideoPerformanceTier } from "@/lib/youtube/insights-comparison";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";
import { cn } from "@/lib/utils";

import { Pager } from "./pager";

type SortKey = "publishedAt" | "views" | "retention";

const PAGE_SIZE = 10;
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

const EXPLANATIONS = {
  topVideos: "Classement de tes vidéos par vues, depuis la connexion de ta chaîne YouTube.",
  retention:
    "Pourcentage moyen de la vidéo regardé par les spectateurs — ce que YouTube utilise pour juger si une vidéo mérite d'être recommandée, avec le watch time. La couleur compare cette vidéo à la médiane de tes autres vidéos du même format (Shorts vs. vidéos longues, si un filtre de format est actif — leur rétention n'est pas sur la même échelle) : vert au-dessus, gris dans la moyenne, rouge en dessous — YouTube recommande lui-même de comparer une vidéo à tes uploads récents plutôt qu'à un seuil absolu.",
  watchTime: "Temps de visionnage total cumulé sur cette vidéo, en minutes.",
  abonnes: "Abonnés gagnés moins abonnés perdus, générés directement par cette vidéo, remonté par YouTube.",
  bookings: "Nombre de RDV bookés attribués à cette vidéo — saisie manuelle, aucune donnée YouTube ne l'expose. Clique sur une vidéo pour la renseigner.",
  dealsClosed: "Nombre de RDV issus de cette vidéo qui se sont conclus par une vente — saisie manuelle. Clique sur une vidéo pour la renseigner.",
} as const;

const TIER_TEXT_CLASS: Record<VideoPerformanceTier, string> = {
  above: "text-state-healthy",
  inline: "text-foreground",
  below: "text-state-critical",
};

function VideoThumbnail({ thumbnailUrl }: { thumbnailUrl: string | null }) {
  const [broken, setBroken] = useState(false);

  if (!thumbnailUrl || broken) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-muted">
        <MonitorPlay className="size-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external YouTube CDN thumbnail, not a Next-optimizable asset
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

const TOP_VIDEOS_COUNT = 3;

function computeTopVideos(videos: YoutubeVideoInsightRow[]): YoutubeVideoInsightRow[] {
  return [...videos]
    .filter((video) => video.views !== null)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, TOP_VIDEOS_COUNT);
}

const FORMAT_SUBTITLE: Record<VideoFormat, string> = {
  all: "toutes vidéos confondues",
  short: "Shorts uniquement",
  long: "vidéos longues uniquement",
};

function TopVideosPanel({ videos, format }: { videos: YoutubeVideoInsightRow[]; format: VideoFormat }) {
  if (videos.length === 0) return null;

  return (
    <div className="sticker-card p-6">
      <div className="flex items-center gap-1.5">
        <h2 className="text-base font-bold">Tes 3 meilleures vidéos</h2>
        <InfoPopover text={EXPLANATIONS.topVideos} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Classées par vues, {FORMAT_SUBTITLE[format]}, depuis ta connexion.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {videos.map((video, index) => (
          <a
            key={video.id}
            href={`https://www.youtube.com/watch?v=${video.videoId}`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex flex-col gap-3 rounded-[var(--radius-control)] border p-4 transition-colors",
              index === 0 ? "border-accent-border bg-accent-soft" : "border-border hover:border-border-hover"
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  index === 0 ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {index + 1}
              </span>
              <VideoThumbnail thumbnailUrl={video.thumbnailUrl} />
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-bold", index === 0 && "text-accent-text")}>{video.title}</p>
                <p className="text-xs text-muted-foreground">{DATE_FORMAT.format(video.publishedAt)}</p>
              </div>
            </div>
            <p className="font-display text-2xl font-bold tabular-nums">
              {NUMBER_FORMAT.format(video.views ?? 0)}
              <span className="ml-1.5 font-sans text-xs font-bold text-muted-foreground">vues</span>
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

export function YoutubeVideosTable({
  videos,
  commercialStats,
  period,
  format,
}: {
  videos: YoutubeVideoInsightRow[];
  commercialStats: Map<string, { bookings: number | null; dealsClosed: number | null }>;
  period: DateFilterKey;
  format: VideoFormat;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  // Format narrows the base cohort everything else derives from — Shorts
  // and long-form have wildly different view/retention baselines, so mixing
  // them (the default "Tous") is fine, but comparing a Short against a
  // cohort padded with long-form videos (or vice versa) would misclassify
  // its "above/below your baseline" tier below.
  const formatFiltered = useMemo(() => videos.filter((video) => matchesFormat(video, format)), [videos, format]);

  const topVideos = useMemo(() => computeTopVideos(formatFiltered), [formatFiltered]);

  const filteredVideos = useMemo(
    () => formatFiltered.filter((video) => isWithinPeriod(video.publishedAt, period)),
    [formatFiltered, period]
  );

  useEffect(() => setPage(1), [period, format]);

  // Deliberately built from formatFiltered (not filteredVideos) — the
  // cohort baseline stays period-independent (see insights-comparison.ts's
  // own comment on why: small channels would get near-empty cohorts
  // otherwise), only split by format now.
  const comparisons = useMemo(() => computeVideoPerformanceComparisons(formatFiltered), [formatFiltered]);

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
    if (key === sortKey) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const active = sortKey === sortKeyValue;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKeyValue)}
        className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
      >
        {label}
        {active ? sortDesc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
      </button>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">Aucune vidéo synchronisée pour l&apos;instant</p>
        <p className="mt-1 text-sm text-muted-foreground">Connecte ta chaîne YouTube ci-dessus pour voir tes vidéos.</p>
      </div>
    );
  }

  // Distinguishes "nothing in this format at all" from "nothing in this
  // format for this period" — the fix is different (pick another format vs.
  // widen the period), so the suggested next step below should be too.
  const emptyStateCopy =
    format !== "all" && formatFiltered.length === 0
      ? { title: `Aucune vidéo au format "${VIDEO_FORMATS.find((f) => f.key === format)?.label}"`, hint: "Choisis un autre format, ou « Tous »." }
      : { title: "Aucune vidéo sur cette période", hint: "Choisis « Tout » pour voir l'historique complet." };

  return (
    <div className="flex flex-col gap-6">
      <TopVideosPanel videos={topVideos} format={format} />

      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold">Toutes les vidéos</h2>
        <p className="text-sm text-muted-foreground">{sorted.length} vidéo{sorted.length > 1 ? "s" : ""} sur la période sélectionnée</p>
      </div>

      {sorted.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{emptyStateCopy.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{emptyStateCopy.hint}</p>
        </div>
      ) : (
        <div className="sticker-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left"><SortHeader label="Date" sortKeyValue="publishedAt" /></th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Titre</th>
                <th className="p-3 text-right"><SortHeader label="Vues" sortKeyValue="views" /></th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <SortHeader label="Rétention" sortKeyValue="retention" />
                    <InfoPopover text={EXPLANATIONS.retention} />
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs font-bold text-muted-foreground">Watch time</span>
                    <InfoPopover text={EXPLANATIONS.watchTime} />
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs font-bold text-muted-foreground">Abonnés</span>
                    <InfoPopover text={EXPLANATIONS.abonnes} />
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs font-bold text-muted-foreground">RDV bookés</span>
                    <InfoPopover text={EXPLANATIONS.bookings} />
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs font-bold text-muted-foreground">RDV closés</span>
                    <InfoPopover text={EXPLANATIONS.dealsClosed} />
                  </div>
                </th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {paged.map((video) => {
                const retention = comparisonMetric(video);
                const tier = comparisons.get(video.videoId)?.tier;
                const netSubscribers =
                  video.subscribersGained !== null && video.subscribersLost !== null ? video.subscribersGained - video.subscribersLost : null;
                const stats = commercialStats.get(video.videoId) ?? { bookings: null, dealsClosed: null };

                return (
                  <tr key={video.id} className="border-b border-border last:border-0">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{DATE_FORMAT.format(video.publishedAt)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <VideoThumbnail thumbnailUrl={video.thumbnailUrl} />
                        <a
                          href={`https://www.youtube.com/watch?v=${video.videoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-1 max-w-[16rem] font-bold hover:underline"
                        >
                          {video.title}
                        </a>
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">{NUMBER_FORMAT.format(video.views ?? 0)}</td>
                    <td className="p-3 text-right">
                      {retention === null ? (
                        <span className="tabular-nums text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={cn("font-bold tabular-nums", tier ? TIER_TEXT_CLASS[tier] : "text-foreground")}
                          title={
                            tier
                              ? `${tier === "above" ? "Au-dessus" : tier === "below" ? "En dessous" : "Dans la moyenne"} de tes ${comparisons.get(video.videoId)?.cohortSize} vidéos comparables`
                              : undefined
                          }
                        >
                          {`${NUMBER_FORMAT.format(Math.round(retention * 10) / 10)}%`}
                        </span>
                      )}
                    </td>
                    <td className={cn("p-3 text-right tabular-nums", video.estimatedMinutesWatched === null && "text-muted-foreground")}>
                      {video.estimatedMinutesWatched === null ? "—" : `${NUMBER_FORMAT.format(video.estimatedMinutesWatched)} min`}
                    </td>
                    <td className={cn("p-3 text-right tabular-nums", netSubscribers === null && "text-muted-foreground")}>
                      {netSubscribers === null ? "—" : `${netSubscribers >= 0 ? "+" : ""}${NUMBER_FORMAT.format(netSubscribers)}`}
                    </td>
                    <td className={cn("p-3 text-right tabular-nums", stats.bookings === null && "text-muted-foreground")}>
                      {stats.bookings === null ? "—" : NUMBER_FORMAT.format(stats.bookings)}
                    </td>
                    <td className={cn("p-3 text-right tabular-nums", stats.dealsClosed === null && "text-muted-foreground")}>
                      {stats.dealsClosed === null ? "—" : NUMBER_FORMAT.format(stats.dealsClosed)}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <YoutubeVideoDetailDialog
                          insight={video}
                          bookings={stats.bookings}
                          dealsClosed={stats.dealsClosed}
                          trigger={
                            <Button type="button" variant="ghost" size="icon-sm" aria-label="Voir le détail">
                              <MonitorPlay className="size-3.5" />
                            </Button>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={safePage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
