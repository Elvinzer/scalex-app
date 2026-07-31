import { Plus } from "lucide-react";
import { after } from "next/server";

import { AgentBanner } from "@/components/agent-banner";
import { LeverImpactEstimate } from "@/components/lever-impact-estimate";
import { LeverStarterPlanCard } from "@/components/lever-starter-plan-card";
import { Button } from "@/components/ui/button";
import { getAgentByKey } from "@/lib/agent/agents-registry";
import { computeCampaignMetrics } from "@/lib/ad-campaigns/metrics";
import { getAdCampaigns } from "@/lib/ad-campaigns/queries";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getLeverImpactEstimate } from "@/lib/levers/impact";
import { getStarterPlan, getStarterProgress } from "@/lib/levers/starter-plan";
import { getLeverStatus } from "@/lib/levers/status";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { activateAdsLever, toggleAdsStarterStep } from "./actions";
import { AdCopyTrigger } from "./ad-copy-trigger";
import { CampaignFormDialog } from "./campaign-form-dialog";
import { CampaignsTable } from "./campaigns-table";

const LEVER_KEY = "ads";
// No settings UI for this — a hardcoded threshold below which running ads
// isn't the priority lever yet, same "explicit constant, no new config"
// approach as every other benchmark in lib/levers/opportunities.ts.
const ADS_MIN_MONTHLY_REVENUE_EUR = 3000;

export default async function AdsPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:ads");
  const [campaigns, profile, lever, agent] = await Promise.all([
    getAdCampaigns(accountId),
    getBusinessProfile(accountId),
    getLeverStatus(accountId, LEVER_KEY),
    getAgentByKey(LEVER_KEY),
  ]);

  const mode: "optimiser" | "demarrer" =
    campaigns.length > 0 || lever.status === "active" ? "optimiser" : "demarrer";

  after(() => track("lever_page_viewed", userId, { lever: LEVER_KEY, mode }));

  const chatContext: ChatContext = { topicType: "lever", topicKey: LEVER_KEY, topicLabel: "Ads", sourcePage: "acquisition_ads" };
  const falcoSkin = resolveFalcoSkin("/acquisition/ads");

  if (mode === "demarrer") {
    const { allSettingEntries, allClosingEntries, allMonthlyRows } = await getDiagnosticKpiRawData(accountId);
    const months = lastCompletedMonths(3);
    const { cashContractedTotal } = aggregatePeriodTotals({ months, allMonthlyRows, allSettingEntries, allClosingEntries });
    const avgMonthlyRevenue = cashContractedTotal / months.length;

    if (avgMonthlyRevenue < ADS_MIN_MONTHLY_REVENUE_EUR) {
      return (
        <div className="flex flex-col gap-8">
          <AgentBanner
            stateText="Les ads ne sont pas prioritaires pour l'instant."
            ctaLabel="Améliorer →"
            chatContext={chatContext}
            mode={mode}
            agentName={agent?.name}
            agentIconKey={agent?.falcoSkinIcon}
            falcoSkin={falcoSkin}
          />
          <div>
            <h1 className="text-3xl font-bold">Ads</h1>
            <p className="mt-1 text-muted-foreground">Le suivi de tes campagnes publicitaires.</p>
          </div>
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm font-bold">Pas prioritaire pour l&apos;instant</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Avec un CA moyen de {formatEur(Math.round(avgMonthlyRevenue))}/mois sur les 3 derniers mois, mieux vaut
              d&apos;abord consolider ton acquisition organique avant d&apos;investir en ads.
            </p>
          </div>
        </div>
      );
    }

    const [plan, progress, impact] = await Promise.all([
      getStarterPlan(LEVER_KEY),
      getStarterProgress(accountId, LEVER_KEY),
      getLeverImpactEstimate(accountId, LEVER_KEY),
    ]);
    const allDone = plan !== null && plan.length > 0 && plan.every((step) => progress.includes(step.order));

    return (
      <div className="flex flex-col gap-8">
        <AgentBanner
          stateText="Tu n'as pas encore de campagnes ads - Falco peut t'aider à démarrer."
          ctaLabel="Améliorer →"
          chatContext={chatContext}
          falcoPose="thinking"
          mode={mode}
          agentName={agent?.name}
          agentIconKey={agent?.falcoSkinIcon}
          falcoSkin={falcoSkin}
        />
        <div>
          <h1 className="text-3xl font-bold">Ads</h1>
          <p className="mt-1 text-muted-foreground">Le suivi de tes campagnes publicitaires.</p>
        </div>
        {impact && <LeverImpactEstimate amountEur={impact.amountEur} explanation={impact.explanation} />}
        {plan && (
          <LeverStarterPlanCard
            steps={plan}
            completedSteps={progress}
            canActivate={allDone}
            onToggleStep={async (order) => {
              "use server";
              await toggleAdsStarterStep(order);
            }}
            onActivate={async () => {
              "use server";
              await activateAdsLever();
            }}
          />
        )}
      </div>
    );
  }

  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend ?? 0), 0);
  const ctrValues = campaigns.map((c) => computeCampaignMetrics(c).ctr).filter((v): v is number => v !== null);
  const avgCtr = ctrValues.length > 0 ? ctrValues.reduce((sum, v) => sum + v, 0) / ctrValues.length : null;
  const cplValues = campaigns
    .map((c) => computeCampaignMetrics(c).costPerLead)
    .filter((v): v is number => v !== null);
  const avgCpl = cplValues.length > 0 ? cplValues.reduce((sum, v) => sum + v, 0) / cplValues.length : null;

  const stateText =
    avgCtr !== null
      ? `CTR moyen de ${formatPercent(avgCtr)}, coût par lead moyen de ${avgCpl === null ? "—" : formatEur(avgCpl)}.`
      : "Aucune campagne suivie pour l'instant.";

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={stateText}
        ctaLabel="Améliorer →"
        chatContext={chatContext}
        mode={mode}
        agentName={agent?.name}
        agentIconKey={agent?.falcoSkinIcon}
        falcoSkin={falcoSkin}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ads</h1>
          <p className="mt-1 text-muted-foreground">
            Le suivi de tes campagnes publicitaires, avec un chat IA pour rédiger tes accroches.
          </p>
        </div>
        <div className="flex gap-2">
          <AdCopyTrigger offers={profile.sales.offers} />
          <CampaignFormDialog
            trigger={
              <Button type="button">
                <Plus className="size-4" />
                Ajouter une campagne
              </Button>
            }
          />
        </div>
      </div>

      {profile.sales.offers.length === 0 && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucune offre renseignée</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute tes offres dans Mon business pour que le chat de création de pub s&apos;appuie dessus.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Dépenses totales</p>
          <p className="mt-2 font-display text-3xl font-bold">{formatEur(totalSpend)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">CTR moyen</p>
          <p className="mt-2 font-display text-3xl font-bold">{avgCtr === null ? "—" : formatPercent(avgCtr)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Coût par lead moyen</p>
          <p className="mt-2 font-display text-3xl font-bold">{avgCpl === null ? "—" : formatEur(avgCpl)}</p>
        </div>
      </div>

      <CampaignsTable campaigns={campaigns} />
    </div>
  );
}
