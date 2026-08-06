import { eq } from "drizzle-orm";

import { db } from "@/db";
import { instagramConnections, youtubeConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import type { ChatContext } from "@/lib/chat-context";
import { getContentPosts } from "@/lib/content-posts/queries";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getInstagramPostInsightsMap } from "@/lib/instagram/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { isPublicVideo } from "@/lib/youtube/format";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";
import { getContentRecommendations, getWinningPatterns } from "@/lib/youtube/recommendations";

import { ContenuView } from "./contenu-view";
import type { YoutubeRecommendationCard } from "./youtube/youtube-recommendations-section";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

const INSTAGRAM_ERROR_MESSAGES: Record<string, string> = {
  not_professional:
    "Ce compte Instagram est un compte personnel. Passe-le en Business ou Créateur (voir le guide dans la fenêtre de connexion) puis réessaie.",
  unknown: "La connexion Instagram a échoué. Réessaie dans un instant.",
};

const YOUTUBE_ERROR_MESSAGES: Record<string, string> = {
  no_channel: "Aucune chaîne YouTube n'est associée à ce compte Google. Connecte-toi avec le compte qui possède la chaîne.",
  no_refresh_token:
    "Google n'a pas renvoyé d'accès permanent. Réessaie la connexion — si le problème persiste, révoque l'accès Scale X dans les paramètres de ton compte Google puis reconnecte.",
  unknown: "La connexion YouTube a échoué. Réessaie dans un instant.",
};

type PlatformTotals = { posts: number; views: number; interactions: number };
type ContentPlatform = "instagram" | "youtube";

function parseContentPlatform(value: string | undefined): ContentPlatform | null {
  return value === "instagram" || value === "youtube" ? value : null;
}

function totalsFor(posts: ContentPostRow[]): PlatformTotals {
  return posts.reduce(
    (sum, post) => ({
      posts: sum.posts + 1,
      views: sum.views + post.views,
      interactions: sum.interactions + (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0),
    }),
    { posts: 0, views: 0, interactions: 0 }
  );
}

export default async function ContenuPage({
  searchParams,
}: {
  searchParams: Promise<{ instagram_error?: string; youtube_error?: string; platform?: string }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  const { instagram_error: instagramError, youtube_error: youtubeError, platform: requestedPlatform } = await searchParams;
  const initialPlatform = parseContentPlatform(requestedPlatform);

  const instagramConnected = Boolean(user?.instagramConnected);
  const youtubeConnected = Boolean(user?.youtubeConnected);
  const [
    posts,
    [instagramConnection],
    instagramInsights,
    [youtubeConnection],
    youtubeInsights,
    youtubeRecommendations,
    youtubeWinningPatterns,
    subscriptionActive,
  ] = await Promise.all([
    getContentPosts(accountId),
    instagramConnected
      ? db.select().from(instagramConnections).where(eq(instagramConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    getInstagramPostInsightsMap(accountId),
    youtubeConnected
      ? db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    getYoutubeVideoInsightsMap(accountId),
    getContentRecommendations(accountId),
    getWinningPatterns(accountId),
    hasActiveSubscription(accountId),
  ]);

  // Private/unlisted uploads are excluded from every figure on this page, not
  // just from the YouTube table — otherwise the global totals would count
  // views the public channel never earned. content_posts has no privacy
  // column of its own, so the public set is resolved through the insights
  // map (externalId == videoId for source="youtube" rows).
  const publicVideoIds = new Set(
    Array.from(youtubeInsights.values())
      .filter(isPublicVideo)
      .map((video) => video.videoId)
  );
  const visiblePosts = posts.filter((post) => post.source !== "youtube" || (post.externalId !== null && publicVideoIds.has(post.externalId)));

  const instagramPosts = visiblePosts.filter((post) => post.source === "instagram");
  const youtubeVideos = Array.from(youtubeInsights.values()).filter(isPublicVideo);
  const global = totalsFor(visiblePosts);
  const youtubeCommercialStats = new Map(
    posts
      .filter((post) => post.source === "youtube" && post.externalId)
      .map((post) => [post.externalId as string, { bookings: post.bookings, dealsClosed: post.dealsClosed }])
  );

  const youtubeAnalyzableVideoCount =
    youtubeWinningPatterns?.analyzedVideoCount ??
    youtubeVideos.filter((video) => video.title.trim().length > 0 && (video.views ?? 0) > 0).length;
  const youtubeFalcoStateText =
    youtubeAnalyzableVideoCount < 5
      ? "Je regarde déjà tes premiers signaux. Publie encore quelques vidéos et je pourrai repérer tes vrais patterns gagnants."
      : youtubeRecommendations.length > 0
        ? `D'après tes insights YouTube, j'ai repéré ${youtubeRecommendations.length} idée${youtubeRecommendations.length > 1 ? "s" : ""} ancrée${youtubeRecommendations.length > 1 ? "s" : "e"} dans ce qui marche déjà chez toi.`
        : "Tes données YouTube sont suffisantes pour faire émerger de nouvelles idées. Régénère-les avec Falco Créateur.";
  const youtubeChatContext: ChatContext = {
    topicType: "general",
    topicKey: null,
    topicLabel: null,
    sourcePage: "page_contenu_youtube",
  };

  const anyConnected = instagramConnected || youtubeConnected;
  const stateText = anyConnected
    ? `${NUMBER_FORMAT.format(global.views)} vues cumulées sur ${NUMBER_FORMAT.format(global.posts)} publication${global.posts > 1 ? "s" : ""}, tous réseaux confondus.`
    : "Connecte un réseau social pour voir la performance de ton contenu.";
  const chatContext: ChatContext = { topicType: "lever", topicKey: "content", topicLabel: "Contenu", sourcePage: "acquisition_contenu" };
  const falcoSkin = resolveFalcoSkin("/acquisition/contenu");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Contenu</h1>
        <p className="mt-1 text-muted-foreground">
          Performance de ton contenu, tous réseaux connectés confondus : vues, engagement, clics et leads générés.
        </p>
      </div>

      {instagramError && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
          {INSTAGRAM_ERROR_MESSAGES[instagramError] ?? INSTAGRAM_ERROR_MESSAGES.unknown}
        </div>
      )}
      {youtubeError && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
          {YOUTUBE_ERROR_MESSAGES[youtubeError] ?? YOUTUBE_ERROR_MESSAGES.unknown}
        </div>
      )}

      <ContenuView
        initialPlatform={initialPlatform}
        posts={instagramPosts}
        instagramInsights={instagramInsights}
        instagramConnected={instagramConnected}
        instagramUsername={instagramConnection?.username ?? null}
        instagramSyncStatus={instagramConnection?.initialSyncStatus ?? null}
        instagramSyncCompletedAt={instagramConnection?.initialSyncCompletedAt ?? null}
        youtubeVideos={youtubeVideos}
        youtubeCommercialStats={youtubeCommercialStats}
        youtubeConnected={youtubeConnected}
        youtubeChannelTitle={youtubeConnection?.channelTitle ?? null}
        youtubeSyncStatus={youtubeConnection?.initialSyncStatus ?? null}
        youtubeSyncCompletedAt={youtubeConnection?.initialSyncCompletedAt ?? null}
        youtubeSubscriberCount={youtubeConnection?.subscriberCount ?? null}
        youtubeRecommendations={youtubeRecommendations.map<YoutubeRecommendationCard>((recommendation) => ({
          ...recommendation,
          createdAt: recommendation.createdAt.toISOString(),
          updatedAt: recommendation.updatedAt.toISOString(),
        }))}
        youtubeAnalyzableVideoCount={youtubeAnalyzableVideoCount}
        youtubeFalcoStateText={youtubeFalcoStateText}
        youtubeChatContext={youtubeChatContext}
        youtubeFalcoSkin={falcoSkin}
        overviewStateText={stateText}
        overviewChatContext={chatContext}
        overviewFalcoSkin={falcoSkin}
        subscriptionActive={subscriptionActive}
        hasConnectedPlatform={anyConnected}
      />
    </div>
  );
}
