"use client";

import { Camera, MonitorPlay } from "lucide-react";
import { useMemo, useState } from "react";

import { InfoPopover } from "@/components/info-popover";
import { InstagramConnectionCard } from "@/components/instagram/instagram-connection-card";
import { YoutubeConnectionCard } from "@/components/youtube/youtube-connection-card";
import { computePostRates } from "@/lib/content-posts/rates";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { DATE_FILTERS, type DateFilterKey, isWithinPeriod } from "@/lib/content-posts/period-filter";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import { formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";
import { VIDEO_FORMATS, type VideoFormat, matchesFormat } from "@/lib/youtube/format";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

import { PostsTable } from "./posts-table";
import { YoutubeVideosTable } from "./youtube-videos-table";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

type Platform = "instagram" | "youtube";

type ContenuViewProps = {
  posts: ContentPostRow[];
  instagramInsights: Map<string, InstagramPostInsightRow>;
  instagramConnected: boolean;
  instagramUsername: string | null;
  instagramSyncStatus: string | null;
  instagramSyncCompletedAt: Date | null;
  youtubeVideos: YoutubeVideoInsightRow[];
  youtubeCommercialStats: Map<string, { bookings: number | null; dealsClosed: number | null }>;
  youtubeConnected: boolean;
  youtubeChannelTitle: string | null;
  youtubeSyncStatus: string | null;
  youtubeSyncCompletedAt: Date | null;
  youtubeSubscriberCount: number | null;
  subscriptionActive: boolean;
};

// One panel visible at a time instead of every connected platform stacked
// vertically — the more platforms a creator connects, the longer the old
// layout got. `period` is shared and persists across a platform switch (only
// the table's pagination resets, via each table's own effect); `platform`
// resets pagination implicitly because switching away unmounts the inactive
// panel's table.
export function ContenuView({
  posts,
  instagramInsights,
  instagramConnected,
  instagramUsername,
  instagramSyncStatus,
  instagramSyncCompletedAt,
  youtubeVideos,
  youtubeCommercialStats,
  youtubeConnected,
  youtubeChannelTitle,
  youtubeSyncStatus,
  youtubeSyncCompletedAt,
  youtubeSubscriberCount,
  subscriptionActive,
}: ContenuViewProps) {
  const [platform, setPlatform] = useState<Platform>(instagramConnected || !youtubeConnected ? "instagram" : "youtube");
  const [period, setPeriod] = useState<DateFilterKey>("all");

  const platforms: { id: Platform; label: string; icon: typeof Camera; connected: boolean }[] = [
    { id: "instagram", label: "Instagram", icon: Camera, connected: instagramConnected },
    { id: "youtube", label: "YouTube", icon: MonitorPlay, connected: youtubeConnected },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {platforms.map((p) => {
          const Icon = p.icon;
          const active = platform === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-control)] border px-3.5 py-2.5 text-left transition-all",
                active ? "border-accent-border bg-accent-soft" : "border-border bg-card hover:border-border-hover"
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  active ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span>
                <span className={cn("block text-sm font-bold", active ? "text-accent-text" : "text-foreground")}>{p.label}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", p.connected ? "bg-state-healthy" : "bg-muted-foreground")} />
                  <span className={cn("text-xs font-bold", p.connected ? "text-state-healthy" : "text-muted-foreground")}>
                    {p.connected ? "Connecté" : "Non connecté"}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {platform === "instagram" ? (
        <InstagramPanel
          connected={instagramConnected}
          username={instagramUsername}
          syncStatus={instagramSyncStatus}
          syncCompletedAt={instagramSyncCompletedAt}
          subscriptionActive={subscriptionActive}
          posts={posts}
          instagramInsights={instagramInsights}
          period={period}
          onPeriodChange={setPeriod}
        />
      ) : (
        <YoutubePanel
          connected={youtubeConnected}
          channelTitle={youtubeChannelTitle}
          syncStatus={youtubeSyncStatus}
          syncCompletedAt={youtubeSyncCompletedAt}
          subscriberCount={youtubeSubscriberCount}
          subscriptionActive={subscriptionActive}
          videos={youtubeVideos}
          commercialStats={youtubeCommercialStats}
          period={period}
          onPeriodChange={setPeriod}
        />
      )}
    </div>
  );
}

// Shared by both panels so the same click drives the KPI cards AND the
// table below — the old page filtered the table only, leaving the KPIs
// pinned to "this month" regardless of what the table showed.
function PeriodPills({ period, onChange }: { period: DateFilterKey; onChange: (key: DateFilterKey) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-muted-foreground">Période :</span>
      {DATE_FILTERS.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={() => onChange(filter.key)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-bold transition-all",
            period === filter.key
              ? "border-accent-border bg-accent-soft text-accent-text"
              : "border-border text-muted-foreground hover:border-border-hover"
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

// YouTube-only — Instagram has no equivalent format split. Shown next to
// PeriodPills so a creator can isolate Shorts from long-form instead of
// having both mixed into the same averages/ranking (their view counts and
// CTR aren't on the same scale, so mixed numbers are misleading either way).
function FormatPills({ format, onChange }: { format: VideoFormat; onChange: (key: VideoFormat) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-muted-foreground">Format :</span>
      {VIDEO_FORMATS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-bold transition-all",
            format === option.key
              ? "border-accent-border bg-accent-soft text-accent-text"
              : "border-border text-muted-foreground hover:border-border-hover"
          )}
        >
          {option.label}
        </button>
      ))}
      <InfoPopover text="YouTube ne fournit aucun indicateur officiel « Short » via son API. On classe comme Short toute vidéo de 2min ou moins -  une vidéo longue publiée au format court peut être mal classée." />
    </div>
  );
}

function InstagramPanel({
  connected,
  username,
  syncStatus,
  syncCompletedAt,
  subscriptionActive,
  posts,
  instagramInsights,
  period,
  onPeriodChange,
}: {
  connected: boolean;
  username: string | null;
  syncStatus: string | null;
  syncCompletedAt: Date | null;
  subscriptionActive: boolean;
  posts: ContentPostRow[];
  instagramInsights: Map<string, InstagramPostInsightRow>;
  period: DateFilterKey;
  onPeriodChange: (key: DateFilterKey) => void;
}) {
  const filtered = useMemo(() => posts.filter((post) => isWithinPeriod(post.publishedAt, period)), [posts, period]);
  const totalViews = filtered.reduce((sum, post) => sum + post.views, 0);
  const clickRates = filtered.map((post) => computePostRates(post).clickRate).filter((rate): rate is number => rate !== null);
  const avgClickRate = clickRates.length > 0 ? clickRates.reduce((sum, rate) => sum + rate, 0) / clickRates.length : null;
  const totalLeads = filtered.reduce((sum, post) => sum + (post.leads ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <InstagramConnectionCard
        connected={connected}
        username={username}
        initialSyncStatus={syncStatus}
        initialSyncCompletedAt={syncCompletedAt}
        subscriptionActive={subscriptionActive}
        primaryCta={!connected}
      />

      {connected && (
        <>
          <PeriodPills period={period} onChange={onPeriodChange} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sticker-card flex flex-col p-5">
              <p className="text-sm font-bold text-muted-foreground">Vues sur la période</p>
              <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(totalViews)}</p>
            </div>
            <div className="sticker-card flex flex-col p-5">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-muted-foreground">Taux de clic moyen</p>
                <InfoPopover text="Instagram ne fournit aucune donnée de clics sortants pour un post organique — ce chiffre reste vide par nature, ce n'est pas un bug." />
              </div>
              <p className="mt-2 font-display text-3xl font-bold">{avgClickRate === null ? "—" : formatPercent(avgClickRate)}</p>
            </div>
            <div className="sticker-card flex flex-col p-5">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-muted-foreground">Leads attribués</p>
                <InfoPopover text="Un lead attribué à un post nécessite un rattachement manuel, qui n'existe plus depuis que le contenu vient uniquement d'Instagram — ce chiffre reste à 0 pour l'instant." />
              </div>
              <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(totalLeads)}</p>
            </div>
          </div>

          <PostsTable posts={posts} period={period} instagramInsights={instagramInsights} />
        </>
      )}
    </div>
  );
}

function YoutubePanel({
  connected,
  channelTitle,
  syncStatus,
  syncCompletedAt,
  subscriberCount,
  subscriptionActive,
  videos,
  commercialStats,
  period,
  onPeriodChange,
}: {
  connected: boolean;
  channelTitle: string | null;
  syncStatus: string | null;
  syncCompletedAt: Date | null;
  subscriberCount: number | null;
  subscriptionActive: boolean;
  videos: YoutubeVideoInsightRow[];
  commercialStats: Map<string, { bookings: number | null; dealsClosed: number | null }>;
  period: DateFilterKey;
  onPeriodChange: (key: DateFilterKey) => void;
}) {
  const [format, setFormat] = useState<VideoFormat>("all");

  const filtered = useMemo(
    () => videos.filter((video) => matchesFormat(video, format) && isWithinPeriod(video.publishedAt, period)),
    [videos, format, period]
  );
  const retentionValues = filtered.map((video) => video.averageViewPercentage).filter((value): value is number => value !== null);
  const avgRetention = retentionValues.length > 0 ? retentionValues.reduce((sum, value) => sum + value, 0) / retentionValues.length : null;
  // No CTR KPI — thumbnail impressions/CTR aren't retrievable via the
  // real-time YouTube Analytics API (see protocol.ts's
  // YOUTUBE_THUMBNAIL_CTR_AVAILABLE), so it's never a real number to
  // average. Views is the working, always-fetchable analog, same as the
  // Instagram panel's own "Vues sur la période" card above.
  const totalViews = filtered.reduce((sum, video) => sum + (video.views ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <YoutubeConnectionCard
        connected={connected}
        channelTitle={channelTitle}
        initialSyncStatus={syncStatus}
        initialSyncCompletedAt={syncCompletedAt}
        subscriptionActive={subscriptionActive}
        primaryCta={!connected}
      />

      {connected && (
        <>
          <PeriodPills period={period} onChange={onPeriodChange} />
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
        </>
      )}
    </div>
  );
}
