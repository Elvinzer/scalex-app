"use client";

import { Clapperboard, RotateCw, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ImproveChat } from "@/components/improve-chat";
import { InfoPopover } from "@/components/info-popover";
import { QuickInsightLaunchButton } from "@/components/insight-execution/quick-insight-launch-button";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import type { YoutubeRecommendationRecord } from "@/lib/youtube/recommendation-types";
import { resolveFalcoSkin } from "@/lib/falco-skins";

import {
  acceptYoutubeRecommendation,
  linkYoutubeRecommendationToVideo,
  regenerateYoutubeRecommendations,
} from "./actions";

const MIN_ANALYZABLE_VIDEOS = 5;
const NUMBER = new Intl.NumberFormat("fr-FR");

export type YoutubeRecommendationCard = Omit<YoutubeRecommendationRecord, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type PublishedVideo = { videoId: string; title: string };

const STATUS_LABEL: Record<YoutubeRecommendationCard["status"], string> = {
  new: "Nouvelle idée",
  building: "En construction",
  filming: "À tourner",
  published: "Publiée",
};

export function YoutubeRecommendationsSection({
  recommendations,
  analyzedVideoCount,
  publishedVideos,
}: {
  recommendations: YoutubeRecommendationCard[];
  analyzedVideoCount: number;
  publishedVideos: PublishedVideo[];
}) {
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
            <h2 id="youtube-recommendations-title" className="text-base font-bold">
              Tes prochaines vidéos
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">D&apos;après ce qui marche déjà chez toi, voilà quoi tourner cette semaine.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={regenerate} disabled={isPending}>
          <RotateCw className={isPending ? "animate-spin" : undefined} />
          Régénérer des idées
        </Button>
      </div>

      {error && <p className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">{error}</p>}

      {analyzedVideoCount < MIN_ANALYZABLE_VIDEOS ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Publie quelques vidéos pour que je repère tes patterns gagnants.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Falco Créateur ne propose pas d&apos;idées hors-sol : il lui faut au moins {MIN_ANALYZABLE_VIDEOS} vidéos publiques analysables.
          </p>
        </div>
      ) : visibleRecommendations.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Falco prépare tes prochaines idées.</p>
          <p className="mt-1 text-sm text-muted-foreground">Régénère les idées quand tes données YouTube sont à jour.</p>
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
                    <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{STATUS_LABEL[recommendation.status]}</span>
                    <h3 className="mt-1 text-lg font-bold">{recommendation.title}</h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">Effort {recommendation.effort}</span>
                </div>

                <div className="rounded-[var(--radius-control)] bg-surface-sunken p-3 text-sm">
                  <p className="font-bold text-accent-2-text">Angle / format</p>
                  <p className="mt-1">{recommendation.angle}</p>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold">Impact estimé</p>
                      <InfoPopover text={recommendation.impactBasis ?? "Estimation prudente basée sur les performances de tes vidéos sources — ce n'est pas une garantie."} />
                    </div>
                    <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {recommendation.estImpact === null ? "—" : `≈ ${NUMBER.format(recommendation.estImpact)} vues`}
                    </p>
                  </div>
                  <span className="text-right text-xs text-muted-foreground">Estimation, pas une promesse</span>
                </div>

                <div>
                  <p className="text-sm font-bold">Pourquoi ça devrait marcher chez toi</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{recommendation.rationale}</p>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <Button type="button" variant="accent2" size="sm" onClick={() => openRecommendation(recommendation)} disabled={isPending}>
                    <Sparkles />
                    Développer avec Falco →
                  </Button>
                  {!isAccepted && (
                    <Button type="button" variant="outline" size="sm" onClick={() => accept(recommendation.id)} disabled={isPending}>
                      Je la tourne
                    </Button>
                  )}
                  {recommendation.status !== "published" && (
                    <QuickInsightLaunchButton sourceType="content_recommendation" sourceId={recommendation.id} />
                  )}
                  {recommendation.status === "filming" && publishedVideos.length > 0 && (
                    <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                      <label htmlFor={`published-video-${recommendation.id}`} className="text-xs font-bold text-muted-foreground">
                        Vidéo publiée
                      </label>
                      <select
                        id={`published-video-${recommendation.id}`}
                        value={selectedVideo}
                        onChange={(event) => setSelectedVideos((current) => ({ ...current, [recommendation.id]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-card px-2 py-1.5 text-xs outline-none focus-visible:border-accent"
                      >
                        <option value="">Choisir une vidéo…</option>
                        {publishedVideos.map((video) => (
                          <option key={video.videoId} value={video.videoId}>
                            {video.title}
                          </option>
                        ))}
                      </select>
                      <Button type="button" variant="secondary" size="xs" onClick={() => linkVideo(recommendation.id)} disabled={!selectedVideo || isPending}>
                        Lier
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
                      Publiée : {linkedVideo.title} →
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Drawer open={activeRecommendation !== null} onOpenChange={(open) => !open && setActiveRecommendation(null)}>
        <DrawerContent>
          {activeRecommendation && (
            <ImproveChat
              context={{
                topicType: "content_idea",
                topicKey: activeRecommendation.id,
                topicLabel: activeRecommendation.title,
                sourcePage: "acquisition_contenu_youtube",
              }}
              period="3-months"
              gapBadge="Falco Créateur"
              falcoSkin={resolveFalcoSkin("/acquisition/contenu/youtube")}
            />
          )}
        </DrawerContent>
      </Drawer>
    </section>
  );
}
