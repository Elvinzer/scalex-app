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

  // SEQUENTIAL, not Promise.all — confirmed by direct reproduction that
  // firing these 4 calls concurrently (each fanning out into its own
  // nested Promise.all of DB reads) intermittently hangs against this
  // project's Supabase pooler (Supavisor, transaction-mode, port 6543):
  // Postgres finishes and reports state "active"/wait_event "ClientRead"
  // (i.e. done, waiting for OUR client to read it) but the response is
  // never delivered back up through postgres-js — 8/10 concurrent runs
  // failed in isolated testing against a freshly-cleaned connection pool,
  // vs 15/15 reliable sequential runs. This is what caused /copilote's
  // real server-side infinite hang (page.tsx never resolves, so even
  // app/(app)/loading.tsx's fallback spins forever) — no client-side fix
  // could have touched this, since the hang happens before any HTML is
  // ever sent. Costs ~2s more than the (unreliable) concurrent version,
  // still well within an acceptable load time, and reliably terminates —
  // a bounded outer timeout stays below as a last-resort structural
  // backstop, per the same rule applied everywhere else this chantier.
  async function resolveAllAgentDataSequentially() {
    const entries: (readonly [string, Awaited<ReturnType<typeof resolveLeverAgentData>>])[] = [];
    for (const agent of agents) {
      entries.push([agent.agentKey, await resolveLeverAgentData(agent.agentKey, ctx)] as const);
    }
    return entries;
  }

  const agentDataEntries = await Promise.race([
    resolveAllAgentDataSequentially(),
    new Promise<(readonly [string, null])[]>((resolve) =>
      setTimeout(() => resolve(agents.map((agent) => [agent.agentKey, null] as const)), 15_000)
    ),
  ]);
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
