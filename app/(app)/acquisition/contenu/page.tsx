import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";

import { AgentBanner } from "@/components/agent-banner";
import { InstagramConnectionCard } from "@/components/instagram/instagram-connection-card";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { instagramConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { computePostRates } from "@/lib/content-posts/rates";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-metrics";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getInstagramPostInsightsMap } from "@/lib/instagram/queries";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { PostFormDialog } from "./post-form-dialog";
import { PostsTable } from "./posts-table";

function currentMonthWindow(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

const INSTAGRAM_ERROR_MESSAGES: Record<string, string> = {
  not_professional:
    "Ce compte Instagram est un compte personnel. Passe-le en Business ou Créateur (voir le guide dans la fenêtre de connexion) puis réessaie.",
  unknown: "La connexion Instagram a échoué. Réessaie dans un instant.",
};

export default async function ContenuPage({ searchParams }: { searchParams: Promise<{ instagram_error?: string }> }) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  const { instagram_error: instagramError } = await searchParams;

  const instagramConnected = Boolean(user?.instagramConnected);
  const [posts, profile, contentBenchmarks, [instagramConnection], instagramInsights, subscriptionActive] = await Promise.all([
    getContentPosts(accountId),
    getBusinessProfile(accountId),
    getContentDiagnosticBenchmarks(user?.sector ?? null),
    instagramConnected
      ? db.select().from(instagramConnections).where(eq(instagramConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    getInstagramPostInsightsMap(accountId),
    hasActiveSubscription(accountId),
  ]);
  const platforms = profile.acquisition.platforms.map((platform) => platform.name).filter(Boolean);

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

  const stateText =
    avgClickRate !== null
      ? `Ton taux de clic moyen est de ${formatPercent(avgClickRate)} ce mois-ci.`
      : "Aucun post suivi ce mois-ci. Ajoute ton premier post pour voir tes chiffres.";
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

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Contenu</h1>
          <p className="mt-1 text-muted-foreground">
            Performance de tes posts : vues, engagement, clics et leads générés.
          </p>
        </div>
        <PostFormDialog
          platforms={platforms}
          trigger={
            // Instagram's connect CTA becomes the screen's one priority
            // (coral) action while disconnected — this stays outline then,
            // per the DA rule against two competing accent CTAs.
            <Button type="button" variant={instagramConnected ? "default" : "outline"}>
              <Plus className="size-4" />
              Ajouter un post
            </Button>
          }
        />
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
          <p className="text-sm font-bold text-muted-foreground">Taux de clic moyen</p>
          <p className="mt-2 font-display text-3xl font-bold">{avgClickRate === null ? "—" : formatPercent(avgClickRate)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Leads attribués</p>
          <p className="mt-2 font-display text-3xl font-bold">{new Intl.NumberFormat("fr-FR").format(totalLeadsThisMonth)}</p>
        </div>
      </div>

      <PostsTable
        posts={posts}
        platforms={platforms}
        topPostId={topPost?.id ?? null}
        contentBenchmarks={contentBenchmarks}
        falcoSkin={falcoSkin}
        instagramInsights={instagramInsights}
      />
    </div>
  );
}
