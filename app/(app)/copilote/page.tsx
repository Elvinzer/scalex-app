import { eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { businessLevers } from "@/db/schema";
import { getAllAgents } from "@/lib/agent/agents-registry";
import { getLastMessagesByAgent } from "@/lib/agent/chat-history";
import { resolveLeverAgentData, type LeverAgentDataContext } from "@/lib/agent/lever-agent-data";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { CopilotePageClient } from "./copilote-page-client";

export default async function CopilotePage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");
  const params = await searchParams;

  after(() => track("copilote_page_viewed", userId));

  const [agents, leverRows, lastMessages, businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows }] = await Promise.all([
    getAllAgents(),
    db.select({ leverKey: businessLevers.leverKey, status: businessLevers.status }).from(businessLevers).where(eq(businessLevers.userId, accountId)),
    getLastMessagesByAgent(accountId),
    getBusinessProfile(accountId),
    getDiagnosticKpiRawData(accountId),
  ]);

  const months = lastCompletedMonths(3);
  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });
  const benchmarks = await getDiagnosticBenchmarks(user?.sector ?? null);
  const points = computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });

  const ctx: LeverAgentDataContext = {
    accountId,
    businessProfile,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    periodMonths: months.length,
    months,
    points,
    sector: user?.sector ?? null,
  };

  const agentDataEntries = await Promise.all(
    agents.map(async (agent) => [agent.agentKey, await resolveLeverAgentData(agent.agentKey, ctx)] as const)
  );
  // Only gapBadge/impactAmountEur are UI-relevant on this page — metricsBlock
  // is prompt-only data, never sent to the client.
  const agentData = Object.fromEntries(
    agentDataEntries.map(([key, data]) => [
      key,
      data ? { gapBadge: data.gapBadge, impactAmountEur: data.impactAmountEur } : null,
    ])
  );

  const leverStatusByKey = Object.fromEntries(leverRows.map((row) => [row.leverKey, row.status]));

  return (
    <CopilotePageClient
      agents={agents.map((agent) => ({ agentKey: agent.agentKey, leverKey: agent.leverKey, name: agent.name, falcoSkinIcon: agent.falcoSkinIcon }))}
      agentData={agentData}
      leverStatusByKey={leverStatusByKey}
      lastMessages={lastMessages}
      initialAgentKey={params.agent ?? null}
    />
  );
}
