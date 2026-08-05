import { eq } from "drizzle-orm";

import { AgentBanner } from "@/components/agent-banner";
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

import { ContenuView } from "./contenu-view";

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

  const clickRates = postsThisMonth.map((post) => computePostRates(post).clickRate).filter((rate): rate is number => rate !== null);
  const avgClickRate = clickRates.length > 0 ? clickRates.reduce((sum, rate) => sum + rate, 0) / clickRates.length : null;

  const youtubeVideos = Array.from(youtubeInsights.values());

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
      {youtubeError && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
          {YOUTUBE_ERROR_MESSAGES[youtubeError] ?? YOUTUBE_ERROR_MESSAGES.unknown}
        </div>
      )}

      <ContenuView
        posts={posts}
        instagramInsights={instagramInsights}
        instagramConnected={instagramConnected}
        instagramUsername={instagramConnection?.username ?? null}
        instagramSyncStatus={instagramConnection?.initialSyncStatus ?? null}
        instagramSyncCompletedAt={instagramConnection?.initialSyncCompletedAt ?? null}
        youtubeVideos={youtubeVideos}
        youtubeConnected={youtubeConnected}
        youtubeChannelTitle={youtubeConnection?.channelTitle ?? null}
        youtubeSyncStatus={youtubeConnection?.initialSyncStatus ?? null}
        youtubeSyncCompletedAt={youtubeConnection?.initialSyncCompletedAt ?? null}
        youtubeSubscriberCount={youtubeConnection?.subscriberCount ?? null}
        subscriptionActive={subscriptionActive}
      />
    </div>
  );
}
