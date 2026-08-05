import { eq } from "drizzle-orm";

import { AgentBanner } from "@/components/agent-banner";
import { InfoPopover } from "@/components/info-popover";
import { InstagramConnectionCard } from "@/components/instagram/instagram-connection-card";
import { YoutubeConnectionCard } from "@/components/youtube/youtube-connection-card";
import { db } from "@/db";
import { instagramConnections, youtubeConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import type { ChatContext } from "@/lib/chat-context";
import { computePostRates } from "@/lib/content-posts/rates";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getInstagramPostInsightsMap } from "@/lib/instagram/queries";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";

import { PostsTable } from "./posts-table";
import { YoutubeVideosTable } from "./youtube-videos-table";

function currentMonthWindow(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

const INSTAGRAM_ERROR_MESSAGES: Record<string, string> = {
  not_professional:
    "Ce compte Instagram est un compte personnel. Passe-le en Business ou Créateur (voir le guide dans la fenêtre de connexion) puis réessaie.",
  unknown: "La connexion Instagram a échoué. Réessaie dans un instant.",
};

const YOUTUBE_ERROR_MESSAGES: Record<string, string> = {
  no_channel: "Aucune chaîne YouTube n'est associée à ce compte Google. Connecte-toi avec le compte qui possède la chaîne.",
  no_refresh_token: "Google n'a pas renvoyé d'accès permanent. Réessaie la connexion — si le problème persiste, révoque l'accès Scale X dans les paramètres de ton compte Google puis reconnecte.",
  unknown: "La connexion YouTube a échoué. Réessaie dans un instant.",
};

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
  const [posts, [instagramConnection], instagramInsights, [youtubeConnection], youtubeInsights, subscriptionActive] = await Promise.all([
    getContentPosts(accountId),
    instagramConnected
      ? db.select().from(instagramConnections).where(eq(instagramConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    getInstagramPostInsightsMap(accountId),
    youtubeConnected
      ? db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    getYoutubeVideoInsightsMap(accountId),
    hasActiveSubscription(accountId),
  ]);

  const { year, month } = currentMonthWindow();
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const postsThisMonth = posts.filter((post) => post.publishedAt.startsWith(monthPrefix));

  const totalViewsThisMonth = postsThisMonth.reduce((sum, post) => sum + post.views, 0);
  const totalLeadsThisMonth = postsThisMonth.reduce((sum, post) => sum + (post.leads ?? 0), 0);

  const clickRates = postsThisMonth.map((post) => computePostRates(post).clickRate).filter((rate): rate is number => rate !== null);
  const avgClickRate = clickRates.length > 0 ? clickRates.reduce((sum, rate) => sum + rate, 0) / clickRates.length : null;

  const topPost = postsThisMonth
    .map((post) => ({ post, rates: computePostRates(post) }))
    .filter((entry) => entry.rates.viewToLeadRate !== null)
    .sort((a, b) => (b.rates.viewToLeadRate ?? 0) - (a.rates.viewToLeadRate ?? 0))[0]?.post ?? null;

  const youtubeVideos = Array.from(youtubeInsights.values());
  const retentionValues = youtubeVideos.map((v) => v.averageViewPercentage).filter((v): v is number => v !== null);
  const avgRetention = retentionValues.length > 0 ? retentionValues.reduce((sum, v) => sum + v, 0) / retentionValues.length : null;
  const ctrValues = youtubeVideos.map((v) => v.impressionsClickThroughRate).filter((v): v is number => v !== null);
  const avgCtr = ctrValues.length > 0 ? ctrValues.reduce((sum, v) => sum + v, 0) / ctrValues.length : null;

  const stateText =
    avgClickRate !== null
      ? `Ton taux de clic moyen est de ${formatPercent(avgClickRate)} ce mois-ci.`
      : "Aucun post suivi ce mois-ci. Connecte ton compte Instagram pour voir tes chiffres.";
  const chatContext: ChatContext = { topicType: "lever", topicKey: "content", topicLabel: "Contenu", sourcePage: "acquisition_contenu" };
  const falcoSkin = resolveFalcoSkin("/acquisition/contenu");

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
          Performance de ton contenu, tous canaux connectés confondus : vues, engagement, clics et leads générés.
        </p>
      </div>

      {instagramError && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
          {INSTAGRAM_ERROR_MESSAGES[instagramError] ?? INSTAGRAM_ERROR_MESSAGES.unknown}
        </div>
      )}

      <InstagramConnectionCard
        connected={instagramConnected}
        username={instagramConnection?.username}
        initialSyncStatus={instagramConnection?.initialSyncStatus}
        initialSyncCompletedAt={instagramConnection?.initialSyncCompletedAt}
        subscriptionActive={subscriptionActive}
        primaryCta={!instagramConnected}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Vues ce mois-ci</p>
          <p className="mt-2 font-display text-3xl font-bold">{new Intl.NumberFormat("fr-FR").format(totalViewsThisMonth)}</p>
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
          <p className="mt-2 font-display text-3xl font-bold">{new Intl.NumberFormat("fr-FR").format(totalLeadsThisMonth)}</p>
        </div>
      </div>

      <PostsTable posts={posts} topPostId={topPost?.id ?? null} instagramInsights={instagramInsights} />

      {youtubeError && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
          {YOUTUBE_ERROR_MESSAGES[youtubeError] ?? YOUTUBE_ERROR_MESSAGES.unknown}
        </div>
      )}

      <YoutubeConnectionCard
        connected={youtubeConnected}
        channelTitle={youtubeConnection?.channelTitle}
        initialSyncStatus={youtubeConnection?.initialSyncStatus}
        initialSyncCompletedAt={youtubeConnection?.initialSyncCompletedAt}
        subscriptionActive={subscriptionActive}
        primaryCta={!instagramConnected && !youtubeConnected}
      />

      {youtubeConnected && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sticker-card flex flex-col p-5">
              <p className="text-sm font-bold text-muted-foreground">Abonnés</p>
              <p className="mt-2 font-display text-3xl font-bold">
                {youtubeConnection?.subscriberCount === null || youtubeConnection?.subscriberCount === undefined
                  ? "—"
                  : new Intl.NumberFormat("fr-FR").format(youtubeConnection.subscriberCount)}
              </p>
            </div>
            <div className="sticker-card flex flex-col p-5">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-muted-foreground">Rétention moyenne</p>
                <InfoPopover text="Pourcentage moyen de tes vidéos regardé par les spectateurs, tous chiffres remontés confondus — le signal que YouTube utilise pour juger si une vidéo mérite d'être recommandée." />
              </div>
              <p className="mt-2 font-display text-3xl font-bold">{avgRetention === null ? "—" : `${Math.round(avgRetention * 10) / 10}%`}</p>
            </div>
            <div className="sticker-card flex flex-col p-5">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-muted-foreground">CTR moyen</p>
                <InfoPopover text="Taux de clic moyen sur la miniature de tes vidéos — avec le watch time, le signal le plus pondéré par l'algorithme YouTube." />
              </div>
              <p className="mt-2 font-display text-3xl font-bold">{avgCtr === null ? "—" : `${Math.round(avgCtr * 10) / 10}%`}</p>
            </div>
          </div>

          <YoutubeVideosTable videos={youtubeVideos} />
        </>
      )}
    </div>
  );
}
