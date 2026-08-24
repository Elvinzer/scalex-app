"use client";

import { Clapperboard, RotateCw, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { FalcoDrawer } from "@/components/falco/falco-drawer";
import { InfoPopover } from "@/components/info-popover";
import { QuickInsightLaunchButton } from "@/components/insight-execution/quick-insight-launch-button";
import { Button } from "@/components/ui/button";
import { DrawerContent } from "@/components/ui/drawer";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import type { YoutubeRecommendationRecord } from "@/lib/youtube/recommendation-types";
import { resolveFalcoSkin } from "@/lib/falco-skins";

import {
  acceptYoutubeRecommendation,
  linkYoutubeRecommendationToVideo,
  regenerateYoutubeRecommendations,
} from "./actions";

const MIN_ANALYZABLE_VIDEOS = 5;
export type YoutubeRecommendationCard = Omit<YoutubeRecommendationRecord, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type PublishedVideo = { videoId: string; title: string };

export function YoutubeRecommendationsSection({
  recommendations,
  analyzedVideoCount,
  publishedVideos,
}: {
  recommendations: YoutubeRecommendationCard[];
  analyzedVideoCount: number;
  publishedVideos: PublishedVideo[];
}) {
  const locale = useLocale();
  const t = useTranslations("content.recommendations");
  const router = useRouter();
  const [activeRecommendation, setActiveRecommendation] = useState<YoutubeRecommendationCard | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleRecommendations = recommendations.slice(0, 5);

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateYoutubeRecommendations();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function openRecommendation(recommendation: YoutubeRecommendationCard) {
    const context = {
      topicType: "content_idea" as const,
      topicKey: recommendation.id,
      topicLabel: recommendation.title,
      sourcePage: "acquisition_contenu_youtube",
    };
    setActiveRecommendation(recommendation);
    void recordImproveChatOpened(context);
  }

  function accept(recommendationId: string) {
    setError(null);
    startTransition(async () => {
      const result = await acceptYoutubeRecommendation(recommendationId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function linkVideo(recommendationId: string) {
    const videoId = selectedVideos[recommendationId];
    if (!videoId) return;
    setError(null);
    startTransition(async () => {
      const result = await linkYoutubeRecommendationToVideo(recommendationId, videoId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="youtube-recommendations-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clapperboard className="size-4 text-accent-2-text" />
            <h2 id="youtube-recommendations-title" className="text-base font-bold">{t("title")}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={regenerate} disabled={isPending}>
          <RotateCw className={isPending ? "animate-spin" : undefined} />
          {t("regenerate")}
        </Button>
      </div>

      {error && <p className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">{error}</p>}

      {analyzedVideoCount < MIN_ANALYZABLE_VIDEOS ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("notEnoughTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("notEnoughHelp", { count: MIN_ANALYZABLE_VIDEOS })}
          </p>
        </div>
      ) : visibleRecommendations.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyHelp")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleRecommendations.map((recommendation) => {
            const isAccepted = recommendation.status === "filming" || recommendation.status === "published";
            const selectedVideo = selectedVideos[recommendation.id] ?? "";
            const linkedVideo = recommendation.linkedVideoId
              ? publishedVideos.find((video) => video.videoId === recommendation.linkedVideoId)
              : null;

            return (
              <article key={recommendation.id} className="sticker-card flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t(recommendation.status)}</span>
                    <h3 className="mt-1 text-lg font-bold">{recommendation.title}</h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{t("effort", { value: recommendation.effort })}</span>
                </div>

                <div className="rounded-[var(--radius-control)] bg-surface-sunken p-3 text-sm">
                  <p className="font-bold text-accent-2-text">{t("angle")}</p>
                  <p className="mt-1">{recommendation.angle}</p>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold">{t("estimatedImpact")}</p>
                      <InfoPopover text={recommendation.impactBasis ?? t("impactBasisFallback")} />
                    </div>
                    <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {recommendation.estImpact === null ? "—" : `≈ ${new Intl.NumberFormat(locale).format(recommendation.estImpact)} ${t("views")}`}
                    </p>
                  </div>
                  <span className="text-right text-xs text-muted-foreground">{t("estimateNote")}</span>
                </div>

                <div>
                  <p className="text-sm font-bold">{t("why")}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{recommendation.rationale}</p>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <Button type="button" variant="accent2" size="sm" onClick={() => openRecommendation(recommendation)} disabled={isPending}>
                    <Sparkles />
                    {t("develop")}
                  </Button>
                  {!isAccepted && (
                    <Button type="button" variant="outline" size="sm" onClick={() => accept(recommendation.id)} disabled={isPending}>
                      {t("film")}
                    </Button>
                  )}
                  {recommendation.status !== "published" && (
                    <QuickInsightLaunchButton sourceType="content_recommendation" sourceId={recommendation.id} />
                  )}
                  {recommendation.status === "filming" && publishedVideos.length > 0 && (
                    <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                      <label htmlFor={`published-video-${recommendation.id}`} className="text-xs font-bold text-muted-foreground">
                        {t("publishedVideo")}
                      </label>
                      <select
                        id={`published-video-${recommendation.id}`}
                        value={selectedVideo}
                        onChange={(event) => setSelectedVideos((current) => ({ ...current, [recommendation.id]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-card px-2 py-1.5 text-xs outline-none focus-visible:border-accent"
                      >
                        <option value="">{t("chooseVideo")}</option>
                        {publishedVideos.map((video) => (
                          <option key={video.videoId} value={video.videoId}>
                            {video.title}
                          </option>
                        ))}
                      </select>
                      <Button type="button" variant="secondary" size="xs" onClick={() => linkVideo(recommendation.id)} disabled={!selectedVideo || isPending}>
                        {t("link")}
                      </Button>
                    </div>
                  )}
                  {linkedVideo && (
                    <a
                      href={`https://www.youtube.com/watch?v=${linkedVideo.videoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full text-xs font-bold text-accent-2-text hover:underline"
                    >
                      {t("publishedPrefix", { title: linkedVideo.title })}
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <FalcoDrawer open={activeRecommendation !== null} onOpenChange={(open) => !open && setActiveRecommendation(null)}>
        <DrawerContent>
          {activeRecommendation && (
            <LazyImproveChat
              context={{
                topicType: "content_idea",
                topicKey: activeRecommendation.id,
                topicLabel: activeRecommendation.title,
                sourcePage: "acquisition_contenu_youtube",
              }}
              period="3-months"
              gapBadge={t("falcoCreator")}
              falcoSkin={resolveFalcoSkin("/acquisition/contenu/youtube")}
            />
          )}
        </DrawerContent>
      </FalcoDrawer>
    </section>
  );
}
