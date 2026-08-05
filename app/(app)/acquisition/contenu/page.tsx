import { Camera, MonitorPlay } from "lucide-react";
import Link from "next/link";
import { eq } from "drizzle-orm";

import { AgentBanner } from "@/components/agent-banner";
import { InstagramConnectionCard } from "@/components/instagram/instagram-connection-card";
import { YoutubeConnectionCard } from "@/components/youtube/youtube-connection-card";
import { db } from "@/db";
import { instagramConnections, youtubeConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import type { ChatContext } from "@/lib/chat-context";
import { getContentPosts } from "@/lib/content-posts/queries";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { isPublicVideo } from "@/lib/youtube/format";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";

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
  searchParams: Promise<{ instagram_error?: string; youtube_error?: string }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  const { instagram_error: instagramError, youtube_error: youtubeError } = await searchParams;

  const instagramConnected = Boolean(user?.instagramConnected);
  const youtubeConnected = Boolean(user?.youtubeConnected);
  const [posts, [instagramConnection], [youtubeConnection], youtubeInsights, subscriptionActive] = await Promise.all([
    getContentPosts(accountId),
    instagramConnected
      ? db.select().from(instagramConnections).where(eq(instagramConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    youtubeConnected
      ? db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    getYoutubeVideoInsightsMap(accountId),
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
  const youtubePosts = visiblePosts.filter((post) => post.source === "youtube");
  const global = totalsFor(visiblePosts);
  const instagramTotals = totalsFor(instagramPosts);
  const youtubeTotals = totalsFor(youtubePosts);
  const engagementRate = global.views > 0 ? global.interactions / global.views : null;

  const anyConnected = instagramConnected || youtubeConnected;
  const stateText = anyConnected
    ? `${NUMBER_FORMAT.format(global.views)} vues cumulées sur ${NUMBER_FORMAT.format(global.posts)} publication${global.posts > 1 ? "s" : ""}, tous réseaux confondus.`
    : "Connecte un réseau social pour voir la performance de ton contenu.";
  const chatContext: ChatContext = { topicType: "lever", topicKey: "content", topicLabel: "Contenu", sourcePage: "acquisition_contenu" };
  const falcoSkin = resolveFalcoSkin("/acquisition/contenu");

  const platforms = [
    {
      key: "instagram",
      label: "Instagram",
      icon: Camera,
      href: "/acquisition/contenu/instagram",
      connected: instagramConnected,
      handle: instagramConnection?.username ? `@${instagramConnection.username}` : null,
      totals: instagramTotals,
      unit: "publications",
    },
    {
      key: "youtube",
      label: "YouTube",
      icon: MonitorPlay,
      href: "/acquisition/contenu/youtube",
      connected: youtubeConnected,
      handle: youtubeConnection?.channelTitle ?? null,
      totals: youtubeTotals,
      unit: "vidéos",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={stateText}
        ctaLabel="Améliorer →"
        chatContext={chatContext}
        mode="optimiser"
        falcoSkin={falcoSkin}
      />

      <div>
        <h1 className="text-3xl font-bold">Contenu</h1>
        <p className="mt-1 text-muted-foreground">
          La performance globale de ton contenu, tous réseaux connectés confondus. Ouvre un réseau pour le détail publication par publication.
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

      {anyConnected && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Publications</p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">{NUMBER_FORMAT.format(global.posts)}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Vues cumulées</p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">{NUMBER_FORMAT.format(global.views)}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Interactions</p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">{NUMBER_FORMAT.format(global.interactions)}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Taux d&apos;engagement</p>
            <p className="mt-2 font-display text-3xl font-bold">{engagementRate === null ? "—" : formatPercent(engagementRate)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Par réseau</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {platforms.map((platform) => {
            const Icon = platform.icon;

            if (!platform.connected) {
              return (
                <div key={platform.key} className="sticker-card-dashed flex flex-col gap-2 p-5">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <p className="font-bold">{platform.label}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Non connecté — connecte ce réseau pour suivre sa performance.</p>
                </div>
              );
            }

            return (
              <Link
                key={platform.key}
                href={platform.href}
                className="sticker-card flex flex-col gap-3 p-5 transition-colors hover:border-border-hover"
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <p className="font-bold">{platform.label}</p>
                  {platform.handle && <span className="truncate text-sm text-muted-foreground">{platform.handle}</span>}
                </div>
                <div className="flex items-baseline gap-5">
                  <div>
                    <p className="text-xs text-muted-foreground">{platform.unit}</p>
                    <p className="font-display text-2xl font-bold tabular-nums">{NUMBER_FORMAT.format(platform.totals.posts)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">vues</p>
                    <p className="font-display text-2xl font-bold tabular-nums">{NUMBER_FORMAT.format(platform.totals.views)}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-accent-text">Voir le détail →</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Connection cards only while a platform is still unconnected. Once
          it's synced the card is pure noise here — managing/disconnecting an
          integration lives on /integrations, which is the single place that
          always shows them. */}
      {!instagramConnected && (
        <InstagramConnectionCard
          connected={false}
          username={null}
          initialSyncStatus={null}
          initialSyncCompletedAt={null}
          subscriptionActive={subscriptionActive}
          primaryCta
        />
      )}
      {!youtubeConnected && (
        <YoutubeConnectionCard
          connected={false}
          channelTitle={null}
          initialSyncStatus={null}
          initialSyncCompletedAt={null}
          subscriptionActive={subscriptionActive}
          primaryCta
        />
      )}
    </div>
  );
}
