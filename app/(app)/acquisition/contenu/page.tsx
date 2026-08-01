import { Plus } from "lucide-react";

import { AgentBanner } from "@/components/agent-banner";
import { Button } from "@/components/ui/button";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { computePostRates } from "@/lib/content-posts/rates";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-metrics";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { PostFormDialog } from "./post-form-dialog";
import { PostsTable } from "./posts-table";

function currentMonthWindow(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export default async function ContenuPage() {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  const [posts, profile, contentBenchmarks] = await Promise.all([
    getContentPosts(accountId),
    getBusinessProfile(accountId),
    getContentDiagnosticBenchmarks(user?.sector ?? null),
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
      : "Aucun post suivi ce mois-ci — ajoute ton premier post pour voir tes chiffres.";
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
            <Button type="button">
              <Plus className="size-4" />
              Ajouter un post
            </Button>
          }
        />
      </div>

      {platforms.length === 0 && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucune plateforme renseignée</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute tes plateformes de contenu dans Mon business pour les retrouver ici.
          </p>
        </div>
      )}

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
      />
    </div>
  );
}
