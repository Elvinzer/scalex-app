import { eq } from "drizzle-orm";

import { db } from "@/db";
import { youtubeConnections } from "@/db/schema";
import { getContentPosts } from "@/lib/content-posts/queries";
import { filterVisibleContentPosts } from "@/lib/content-posts/visibility";
import { getInstagramPostInsightsMap } from "@/lib/instagram/queries";
import { isPublicVideo } from "@/lib/youtube/format";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";
import { getWinningPatterns } from "@/lib/youtube/recommendations";
import { getVideoAttributionTotals } from "@/lib/youtube/attribution";

import type { LeverAgentData, LeverAgentDataContext } from "./lever-agent-data";
import { resolveLeverAgentData } from "./lever-agent-data";
import type { PageAgentContext } from "./page-context";

// Page-scoped data for the Falco hook. Every number here is computed in
// code and handed to the model already aggregated — per CLAUDE.md's
// "jamais pre-agreger cote LLM" rule, the model only phrases what it's given.

const NUMBER = new Intl.NumberFormat("fr-FR");

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// The `content` lever builder mixes every platform into one funnel, which is
// useless for a page that only shows one channel — this is YouTube alone,
// with the channel-level figures the page itself displays.
async function buildYoutubeContentData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const [insights, rawPosts, [connection], attributions] = await Promise.all([
    getYoutubeVideoInsightsMap(ctx.accountId),
    getContentPosts(ctx.accountId),
    db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, ctx.accountId)).limit(1),
    getVideoAttributionTotals(ctx.accountId),
  ]);
  const winning = await getWinningPatterns(ctx.accountId);

  const videos = Array.from(insights.values()).filter(isPublicVideo);
  if (videos.length === 0) {
    return {
      metricsBlock: "Aucune vidéo YouTube publique synchronisée pour l'instant.",
      impactAmountEur: null,
      impactExplanation: "Pas de simulation de gain chiffré pour le contenu.",
      gapBadge: null,
    };
  }

  const posts = filterVisibleContentPosts(rawPosts, Array.from(insights.values()));
  const commercial = new Map(
    posts
      .filter((post) => post.source === "youtube" && post.externalId)
      .map((post) => {
        const attribution = attributions.get(post.externalId as string);
        const attributedDeals = attribution ? attribution.declaredSales + attribution.estimatedSales : 0;
        return [post.externalId as string, {
          bookings: post.bookings,
          dealsClosed: attributedDeals > 0 ? attributedDeals : post.dealsClosed,
        }] as const;
      })
  );

  const totalViews = videos.reduce((sum, video) => sum + (video.views ?? 0), 0);
  const avgRetention = average(videos.map((v) => v.averageViewPercentage).filter((v): v is number => v !== null));
  const netSubscribers = videos.reduce(
    (sum, video) => sum + (video.subscribersGained ?? 0) - (video.subscribersLost ?? 0),
    0
  );
  const totalBookings = Array.from(commercial.values()).reduce((sum, s) => sum + (s.bookings ?? 0), 0);
  const totalDeals = Array.from(commercial.values()).reduce((sum, s) => sum + (s.dealsClosed ?? 0), 0);

  const top = [...videos].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 3);
  const topLines = top
    .map((video) => {
      const stats = commercial.get(video.videoId);
      const retention = video.averageViewPercentage === null ? "?" : `${Math.round(video.averageViewPercentage)}%`;
      const rdv = stats?.bookings ? `, ${stats.bookings} RDV bookés` : "";
      return `- "${video.title}" : ${NUMBER.format(video.views ?? 0)} vues, ${retention} de rétention${rdv}.`;
    })
    .join("\n");

  const channelLine = [
    connection?.subscriberCount !== null && connection?.subscriberCount !== undefined
      ? `${NUMBER.format(connection.subscriberCount)} abonnés`
      : null,
    `${videos.length} vidéos publiques`,
    `${NUMBER.format(totalViews)} vues cumulées`,
    avgRetention === null ? null : `${Math.round(avgRetention)}% de rétention moyenne`,
    `${netSubscribers >= 0 ? "+" : ""}${NUMBER.format(netSubscribers)} abonnés nets générés par ces vidéos`,
    `${totalBookings} RDV bookés et ${totalDeals} RDV closés attribués manuellement à des vidéos`,
  ]
    .filter(Boolean)
    .join(", ");

  const winningLines = winning
    ? [
        `Profil gagnant extrait de ${winning.analyzedVideoCount} vidéos :`,
        ...winning.themes.slice(0, 3).map((theme) => `- thème ${theme.label}, ${Math.round(theme.averageViews)} vues moyennes`),
        ...winning.formats.slice(0, 2).map((format) => `- format ${format.label}, ${Math.round(format.averageViews)} vues moyennes`),
      ].join("\n")
    : "Profil gagnant encore en cours de construction.";

  return {
    metricsBlock: `Chaîne YouTube : ${channelLine}.\n\nTop 3 vidéos par vues :\n${topLines}\n\n${winningLines}`,
    impactAmountEur: null,
    impactExplanation: "Pas de simulation de gain chiffré pour le contenu — pas de cascade directe jusqu'à la vente.",
    gapBadge: avgRetention === null ? null : `${Math.round(avgRetention)}% de rétention moyenne`,
  };
}

async function buildInstagramContentData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const [insights, posts] = await Promise.all([getInstagramPostInsightsMap(ctx.accountId), getContentPosts(ctx.accountId)]);

  const instagramPosts = posts.filter((post) => post.source === "instagram");
  if (instagramPosts.length === 0) {
    return {
      metricsBlock: "Aucune publication Instagram synchronisée pour l'instant.",
      impactAmountEur: null,
      impactExplanation: "Pas de simulation de gain chiffré pour le contenu.",
      gapBadge: null,
    };
  }

  const totalViews = instagramPosts.reduce((sum, post) => sum + post.views, 0);
  const totalInteractions = instagramPosts.reduce(
    (sum, post) => sum + (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0),
    0
  );
  const engagementRate = totalViews > 0 ? Math.round((totalInteractions / totalViews) * 1000) / 10 : null;

  const top = [...instagramPosts].sort((a, b) => b.views - a.views).slice(0, 3);
  const topLines = top
    .map((post) => {
      const insight = post.externalId ? insights.get(post.externalId) : undefined;
      const saves = insight?.savedCount ? `, ${insight.savedCount} enregistrements` : "";
      const interactions = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0);
      return `- "${post.title}" (${post.type}) : ${NUMBER.format(post.views)} vues, ${NUMBER.format(interactions)} interactions${saves}.`;
    })
    .join("\n");

  return {
    metricsBlock:
      `Compte Instagram : ${instagramPosts.length} publications, ${NUMBER.format(totalViews)} vues cumulées, ` +
      `${NUMBER.format(totalInteractions)} interactions` +
      `${engagementRate === null ? "" : `, ${engagementRate}% d'engagement`}.\n\nTop 3 publications par vues :\n${topLines}`,
    impactAmountEur: null,
    impactExplanation: "Pas de simulation de gain chiffré pour le contenu — Instagram n'expose aucune donnée de clic sortant.",
    gapBadge: engagementRate === null ? null : `${engagementRate}% d'engagement`,
  };
}

// Page-specific slice first, existing lever builder otherwise. Returns null
// when the page has neither — the prompt then falls back to the generic
// diagnostic points, exactly as before this feature existed.
export async function resolvePageAgentData(page: PageAgentContext, ctx: LeverAgentDataContext): Promise<LeverAgentData | null> {
  if (page.dataKey === "youtube") return buildYoutubeContentData(ctx);
  if (page.dataKey === "instagram") return buildInstagramContentData(ctx);
  if (page.leverKey) return resolveLeverAgentData(page.leverKey, ctx);
  return null;
}
