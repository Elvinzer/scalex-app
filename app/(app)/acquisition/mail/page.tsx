import { Plus } from "lucide-react";
import { after } from "next/server";

import { AgentBanner } from "@/components/agent-banner";
import { KpiTile } from "@/components/kpi-tile";
import { LeverImpactEstimate } from "@/components/lever-impact-estimate";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { formatEur } from "@/lib/currency";
import { computeEmailCampaignMetrics } from "@/lib/email-campaigns/metrics";
import { getEmailCampaigns } from "@/lib/email-campaigns/queries";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getLeverImpactEstimate } from "@/lib/levers/impact";
import { getLeverStatus } from "@/lib/levers/status";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { CampaignFormDialog } from "./campaign-form-dialog";
import { CampaignsTable } from "./campaigns-table";
import { DiscoveryQuestion } from "./discovery-question";

const LEVER_KEY = "email_marketing";

export default async function MailPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:mail");

  const [campaigns, lever] = await Promise.all([
    getEmailCampaigns(accountId),
    getLeverStatus(accountId, LEVER_KEY),
  ]);

  const mode: "optimiser" | "demarrer" | "decouverte" =
    lever.status === "active" || campaigns.length > 0
      ? "optimiser"
      : lever.status === "not_answered"
        ? "decouverte"
        : "demarrer";

  after(() => track("lever_page_viewed", userId, { lever: LEVER_KEY, mode }));

  const chatContext: ChatContext = { topicType: "lever", topicKey: LEVER_KEY, topicLabel: "Emailing", sourcePage: "acquisition_mail" };
  const falcoSkin = resolveFalcoSkin("/acquisition/mail");

  if (mode === "decouverte") {
    return (
      <div className="flex flex-col gap-8">
        <AgentBanner
          stateText="Pas encore vu si tu fais de l'emailing. Une question rapide."
          ctaLabel="Améliorer →"
          chatContext={chatContext}
          mode={mode}
          falcoSkin={falcoSkin}
        />
        <div>
          <h1 className="text-3xl font-bold">Mail</h1>
          <p className="mt-1 text-muted-foreground">Le suivi de tes envois email, une fois lancé.</p>
        </div>
        <DiscoveryQuestion />
      </div>
    );
  }

  if (mode === "demarrer") {
    const impact = await getLeverImpactEstimate(accountId, LEVER_KEY);

    return (
      <div className="flex flex-col gap-8">
        <AgentBanner
          stateText="Tu n'as pas encore d'emailing en place - Falco peut t'aider à démarrer."
          ctaLabel="Améliorer →"
          chatContext={chatContext}
          falcoPose="thinking"
          mode={mode}
          falcoSkin={falcoSkin}
        />
        <div>
          <h1 className="text-3xl font-bold">Mail</h1>
          <p className="mt-1 text-muted-foreground">Le suivi de tes envois email, une fois lancé.</p>
        </div>
        {impact && (
          <LeverImpactEstimate
            amountEur={impact.amountEur}
            rangeEur={impact.impactRangeEur}
            explanation={impact.explanation}
            warning={impact.warning}
            contextSentence={impact.contextSentence}
          />
        )}
        <Button variant="outline" asChild className="self-start">
          <a href={`/demarrer/${LEVER_KEY}`}>Voir le guide complet →</a>
        </Button>
      </div>
    );
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthCampaigns = campaigns.filter((c) => c.sentAt.startsWith(currentMonth));
  const totalSends = monthCampaigns.reduce((sum, c) => sum + c.sends, 0);
  const openRates = monthCampaigns.map((c) => computeEmailCampaignMetrics(c).openRate).filter((v): v is number => v !== null);
  const avgOpenRate = openRates.length > 0 ? openRates.reduce((sum, v) => sum + v, 0) / openRates.length : null;
  const ctrValues = monthCampaigns.map((c) => computeEmailCampaignMetrics(c).ctr).filter((v): v is number => v !== null);
  const avgCtr = ctrValues.length > 0 ? ctrValues.reduce((sum, v) => sum + v, 0) / ctrValues.length : null;
  const totalRevenue = monthCampaigns.reduce((sum, c) => sum + (c.revenueAttributed ?? 0), 0);
  const totalBookings = monthCampaigns.reduce((sum, c) => sum + (c.bookings ?? 0), 0);
  const totalDealsClosed = monthCampaigns.reduce((sum, c) => sum + (c.dealsClosed ?? 0), 0);
  const listSize = typeof lever.stats.listSize === "number" ? lever.stats.listSize : null;

  const stateText =
    avgOpenRate !== null
      ? `Taux d'ouverture moyen de ${formatPercent(avgOpenRate)} ce mois-ci, ${formatEur(totalRevenue)} de CA attribué.`
      : "Aucun envoi ce mois-ci pour l'instant.";

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={stateText}
        ctaLabel="Améliorer →"
        chatContext={chatContext}
        mode={mode}
        falcoSkin={falcoSkin}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mail</h1>
          <p className="mt-1 text-muted-foreground">Le suivi de tes envois email.</p>
        </div>
        <CampaignFormDialog
          trigger={
            <Button type="button">
              <Plus className="size-4" />
              Ajouter un envoi
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {listSize !== null && (
          <KpiTile label="Taille de liste" value={listSize.toLocaleString("fr-FR")} />
        )}
        <KpiTile label="Envois ce mois" value={totalSends.toLocaleString("fr-FR")} />
        <KpiTile label="Taux d'ouverture" value={avgOpenRate === null ? "—" : formatPercent(avgOpenRate)} tone="positive" />
        <KpiTile label="Taux de clic" value={avgCtr === null ? "—" : formatPercent(avgCtr)} tone="accent2" />
        <KpiTile label="RDV bookés ce mois" value={totalBookings.toLocaleString("fr-FR")} />
        <KpiTile label="RDV closés ce mois" value={totalDealsClosed.toLocaleString("fr-FR")} tone="positive" />
      </div>

      <CampaignsTable campaigns={campaigns} falcoSkin={falcoSkin} />
    </div>
  );
}
