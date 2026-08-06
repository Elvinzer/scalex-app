"use client";

import { Camera, MonitorPlay } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { InstagramConnectionCard } from "@/components/instagram/instagram-connection-card";
import { YoutubeConnectionCard } from "@/components/youtube/youtube-connection-card";
import { AgentBanner } from "@/components/agent-banner";
import type { ContentPostRow } from "@/lib/content-posts/types";
import type { DateFilterKey } from "@/lib/content-posts/period-filter";
import type { ChatContext } from "@/lib/chat-context";
import type { FalcoSkinKey } from "@/lib/falco-skins";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import type { VideoFormat } from "@/lib/youtube/format";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";
import { cn } from "@/lib/utils";

import { InstagramView } from "./instagram-view";
import { YoutubeHooksSection } from "./youtube-hooks-section";
import type { YoutubeRecommendationCard } from "./youtube/youtube-recommendations-section";
import { YoutubeRecommendationsSection } from "./youtube/youtube-recommendations-section";
import { YoutubeView } from "./youtube-view";

type Platform = "instagram" | "youtube";

type ContenuViewProps = {
  initialPlatform: Platform | null;
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
  youtubeRecommendations?: YoutubeRecommendationCard[];
  youtubeAnalyzableVideoCount?: number;
  youtubeFalcoStateText?: string;
  youtubeChatContext?: ChatContext;
  youtubeFalcoSkin?: FalcoSkinKey | null;
  overviewStateText?: string;
  overviewChatContext?: ChatContext;
  overviewFalcoSkin?: FalcoSkinKey | null;
  subscriptionActive: boolean;
  hasConnectedPlatform: boolean;
};

const PLATFORM_OPTIONS: { id: Platform; label: string; icon: typeof Camera }[] = [
  { id: "instagram", label: "Instagram", icon: Camera },
  { id: "youtube", label: "YouTube", icon: MonitorPlay },
];

const DEFAULT_OVERVIEW_CONTEXT: ChatContext = {
  topicType: "lever",
  topicKey: "content",
  topicLabel: "Contenu",
  sourcePage: "acquisition_contenu",
};
const DEFAULT_YOUTUBE_CONTEXT: ChatContext = {
  topicType: "general",
  topicKey: null,
  topicLabel: null,
  sourcePage: "page_contenu_youtube",
};

function isPlatform(value: string | null): value is Platform {
  return value === "instagram" || value === "youtube";
}

export function ContenuView({
  initialPlatform,
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
  youtubeRecommendations = [],
  youtubeAnalyzableVideoCount = 0,
  youtubeFalcoStateText = "Je regarde les signaux de ta chaîne YouTube.",
  youtubeChatContext = DEFAULT_YOUTUBE_CONTEXT,
  youtubeFalcoSkin = null,
  overviewStateText = "Regardons la performance de ton contenu.",
  overviewChatContext = DEFAULT_OVERVIEW_CONTEXT,
  overviewFalcoSkin = null,
  subscriptionActive,
  hasConnectedPlatform,
}: ContenuViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const defaultPlatform: Platform = instagramConnected || !youtubeConnected ? "instagram" : "youtube";
  const [platform, setPlatform] = useState<Platform>(() => initialPlatform ?? defaultPlatform);
  const [period, setPeriod] = useState<DateFilterKey>("all");
  const [youtubeFormat, setYoutubeFormat] = useState<VideoFormat>("all");

  const updatePlatformUrl = useCallback(
    (nextPlatform: Platform) => {
      const params = new URLSearchParams(window.location.search);
      params.set("platform", nextPlatform);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router]
  );

  useEffect(() => {
    const requestedPlatform = new URLSearchParams(window.location.search).get("platform");
    if (!isPlatform(requestedPlatform)) updatePlatformUrl(platform);
  }, [platform, updatePlatformUrl]);

  const connectedByPlatform: Record<Platform, boolean> = {
    instagram: instagramConnected,
    youtube: youtubeConnected,
  };

  return (
    <div className="flex flex-col gap-6">
      <AgentBanner
        stateText={platform === "youtube" ? youtubeFalcoStateText : overviewStateText}
        ctaLabel="Parler contenu →"
        chatContext={platform === "youtube" ? youtubeChatContext : overviewChatContext}
        gapBadge={platform === "youtube" ? "Falco Créateur" : null}
        mode={platform === "youtube" ? null : "optimiser"}
        falcoSkin={platform === "youtube" ? youtubeFalcoSkin : overviewFalcoSkin}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Plateforme de contenu">
        {PLATFORM_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = platform === option.id;
          const connected = connectedByPlatform[option.id];

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setPlatform(option.id);
                updatePlatformUrl(option.id);
              }}
              className={cn(
                "flex min-h-11 min-w-[10.5rem] cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border px-3.5 py-2.5 text-left transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20",
                active ? "border-accent-border bg-accent-soft" : "border-border bg-card hover:-translate-y-px hover:border-border-hover hover:shadow-sm"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-bold", active ? "text-accent-text" : "text-foreground")}>{option.label}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn("size-1.5 rounded-full", connected ? "bg-state-healthy" : "bg-muted-foreground")} />
                  <span className={cn("text-xs font-bold", connected ? "text-state-healthy" : "text-muted-foreground")}>
                    {connected ? "Connecté" : "Non connecté"}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div id={`content-panel-${platform}`} role="region" aria-labelledby={`content-panel-${platform}-heading`} className="flex flex-col gap-6">
        <h2 id={`content-panel-${platform}-heading`} className="sr-only">
          Données de contenu {platform === "instagram" ? "Instagram" : "YouTube"}
        </h2>

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
            format={youtubeFormat}
            onFormatChange={setYoutubeFormat}
            recommendations={youtubeRecommendations}
            analyzableVideoCount={youtubeAnalyzableVideoCount}
          />
        )}
      </div>

      {!hasConnectedPlatform && <p className="sr-only">Aucune plateforme n&apos;est encore connectée.</p>}
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
  onPeriodChange: (period: DateFilterKey) => void;
}) {
  return (
    <>
      <InstagramConnectionCard
        connected={connected}
        username={username}
        initialSyncStatus={syncStatus}
        initialSyncCompletedAt={syncCompletedAt}
        subscriptionActive={subscriptionActive}
        primaryCta={!connected}
      />

      {connected && <InstagramView posts={posts} instagramInsights={instagramInsights} period={period} onPeriodChange={onPeriodChange} />}
    </>
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
  format,
  onFormatChange,
  recommendations,
  analyzableVideoCount,
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
  onPeriodChange: (period: DateFilterKey) => void;
  format: VideoFormat;
  onFormatChange: (format: VideoFormat) => void;
  recommendations: YoutubeRecommendationCard[];
  analyzableVideoCount: number;
}) {
  return (
    <>
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
          <YoutubeHooksSection videos={videos} />
          <YoutubeView
            videos={videos}
            commercialStats={commercialStats}
            subscriberCount={subscriberCount}
            period={period}
            onPeriodChange={onPeriodChange}
            format={format}
            onFormatChange={onFormatChange}
          />
          <YoutubeRecommendationsSection
            recommendations={recommendations}
            analyzedVideoCount={analyzableVideoCount}
            publishedVideos={videos.map((video) => ({ videoId: video.videoId, title: video.title }))}
          />
        </>
      )}
    </>
  );
}
