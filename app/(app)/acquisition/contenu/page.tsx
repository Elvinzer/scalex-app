import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";

import { db } from "@/db";
import { instagramConnections, youtubeConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import type { ChatContext } from "@/lib/chat-context";
import { getContentPosts } from "@/lib/content-posts/queries";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { filterVisibleContentPosts } from "@/lib/content-posts/visibility";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getInstagramPostInsightsMap } from "@/lib/instagram/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { getVideoAttributionTotals } from "@/lib/youtube/attribution";
import { isPublicVideo } from "@/lib/youtube/format";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";
import { getContentRecommendations } from "@/lib/youtube/recommendations";

import { ContenuView } from "./contenu-view";
import type { YoutubeRecommendationCard } from "./youtube/youtube-recommendations-section";

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
  const t = await getTranslations("content");
  const locale = await getLocale();
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
    videoAttributionTotals,
    youtubeRecommendations,
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
    getVideoAttributionTotals(accountId),
    getContentRecommendations(accountId),
    hasActiveSubscription(accountId),
  ]);

  // Private/unlisted uploads are excluded from every figure on this page, not
  // just from the YouTube table — otherwise the global totals would count
  // views the public channel never earned. content_posts has no privacy
  // column of its own, so the public set is resolved through the insights
  // map (externalId == videoId for source="youtube" rows).
  const visiblePosts = filterVisibleContentPosts(posts, Array.from(youtubeInsights.values()));

  const instagramPosts = visiblePosts.filter((post) => post.source === "instagram");
  const youtubeVideos = Array.from(youtubeInsights.values()).filter(isPublicVideo);
  const global = totalsFor(visiblePosts);
  const youtubeCommercialStats = new Map(
    posts
      .filter((post) => post.source === "youtube" && post.externalId)
      .map((post) => {
        const attribution = videoAttributionTotals.get(post.externalId as string);
        const attributedDeals = attribution ? attribution.declaredSales + attribution.estimatedSales : 0;
        return [post.externalId as string, {
          bookings: post.bookings,
          // The same precedence rule as Diagnostic/content-metrics: a real
          // sale attribution wins; old/manual post annotations remain the
          // fallback when no attribution exists.
          dealsClosed: attributedDeals > 0 ? attributedDeals : post.dealsClosed,
        }] as const;
      })
  );

  // Always derive this from the current insight rows. The winning-patterns
  // snapshot is intentionally persistent, so using its old count here made
  // the page keep saying "1 vidéo" after a newer sync had imported hundreds.
  const youtubeAnalyzableVideoCount = youtubeVideos.filter(
    (video) => video.title.trim().length > 0 && (video.views ?? 0) > 0
  ).length;
  const youtubeFalcoStateText =
    youtubeAnalyzableVideoCount < 5
      ? t("youtubeEarlySignals")
      : youtubeRecommendations.length > 0
        ? t("youtubeIdeas", { count: youtubeRecommendations.length })
        : t("youtubeEnoughData");
  const youtubeChatContext: ChatContext = {
    topicType: "general",
    topicKey: null,
    topicLabel: null,
    sourcePage: "page_contenu_youtube",
  };

  const anyConnected = instagramConnected || youtubeConnected;
  const stateText = anyConnected
    ? t("overviewConnected", { views: new Intl.NumberFormat(locale).format(global.views), posts: new Intl.NumberFormat(locale).format(global.posts) })
    : t("overviewDisconnected");
  const chatContext: ChatContext = { topicType: "lever", topicKey: "content", topicLabel: t("title"), sourcePage: "acquisition_contenu" };
  const falcoSkin = resolveFalcoSkin("/acquisition/contenu");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {instagramError && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
          {instagramError === "not_professional" ? t("instagramNotProfessional") : t("instagramError")}
        </div>
      )}
      {youtubeError && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
          {youtubeError === "no_channel" ? t("youtubeNoChannel") : youtubeError === "no_refresh_token" ? t("youtubeNoRefreshToken") : t("youtubeError")}
        </div>
      )}

      <ContenuView
        initialPlatform={initialPlatform}
        posts={instagramPosts}
        instagramInsights={instagramInsights}
        instagramConnected={instagramConnected}
        instagramUsername={instagramConnection?.username ?? null}
        instagramSyncStatus={instagramConnection?.initialSyncStatus ?? null}
        instagramLastSyncAt={instagramConnection?.lastInsightsSyncAt ?? null}
        youtubeVideos={youtubeVideos}
        youtubeCommercialStats={youtubeCommercialStats}
        youtubeConnected={youtubeConnected}
        youtubeChannelTitle={youtubeConnection?.channelTitle ?? null}
        youtubeSyncStatus={youtubeConnection?.initialSyncStatus ?? null}
        youtubeLastSyncAt={youtubeConnection?.lastAnalyticsSyncAt ?? null}
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
