import { AgentBanner } from "@/components/agent-banner";
import { getAgentByKey } from "@/lib/agent/agents-registry";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { toIsoDate, todayUtc } from "@/lib/date-range";
import type { DateRange } from "@/lib/date-range";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getCommentCounts, getLeads } from "@/lib/leads/queries";
import { computeLeadPipelineStats } from "@/lib/leads/stats";
import { getSetters } from "@/lib/setters/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { KanbanBoard } from "./kanban-board";
import { NewLeadDialog } from "./new-lead-dialog";
import { PipelineStatsBanner } from "./pipeline-stats-banner";

function monthsAgoRange(monthsBack: number): DateRange {
  const today = todayUtc();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1));
  return { from: toIsoDate(start), to: toIsoDate(today) };
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:pipeline");
  const params = await searchParams;
  const period = params.period === "3-months" ? "3-months" : "current-month";

  const range = period === "3-months" ? monthsAgoRange(2) : monthsAgoRange(0);
  const rangeLengthDays = Math.round((new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const previousTo = new Date(`${range.from}T00:00:00Z`);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - (rangeLengthDays - 1));
  const previousRange: DateRange = { from: toIsoDate(previousFrom), to: toIsoDate(previousTo) };

  const [leads, setters, businessProfile, commentCounts, agent] = await Promise.all([
    getLeads(accountId),
    getSetters(accountId),
    getBusinessProfile(accountId),
    getCommentCounts(accountId),
    getAgentByKey("ceo_vision"),
  ]);

  const stats = await computeLeadPipelineStats(accountId, range, previousRange, user?.sector ?? null);

  const chatContext: ChatContext = { topicType: "lever", topicKey: "ceo_vision", topicLabel: "Vision", sourcePage: "acquisition_pipeline" };
  const falcoSkin = resolveFalcoSkin("/acquisition/pipeline");
  const offers = businessProfile.sales.offers;

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText="Ton pipeline de leads, de bout en bout."
        ctaLabel="Améliorer →"
        chatContext={chatContext}
        mode="optimiser"
        agentName={agent?.name}
        agentIconKey={agent?.falcoSkinIcon}
        falcoSkin={falcoSkin}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Pipeline</h1>
          <p className="mt-1 text-muted-foreground">Suivi de tes leads, de la prise de contact à la vente.</p>
        </div>
        <NewLeadDialog offers={offers} setters={setters} />
      </div>

      <PipelineStatsBanner stats={stats} period={period} />

      <KanbanBoard initialLeads={leads} offers={offers} setters={setters} commentCounts={commentCounts} />
    </div>
  );
}
