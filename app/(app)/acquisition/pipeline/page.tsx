import Link from "next/link";
import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
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
import { TodayPipelineView } from "./today-view";

function monthsAgoRange(monthsBack: number): DateRange {
  const today = todayUtc();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1));
  return { from: toIsoDate(start), to: toIsoDate(today) };
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ period?: string; lead?: string; from?: string; view?: string }> }) {
  const t = await getTranslations("pipeline");
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:pipeline");
  const params = await searchParams;
  const period = params.period === "3-months" ? "3-months" : "current-month";
  const fromDashboard = params.from === "dashboard";
  const view = params.view === "stage" ? "stage" : "today";
  const targetLeadId = z.string().uuid().safeParse(params.lead).success ? params.lead ?? null : null;

  const range = period === "3-months" ? monthsAgoRange(2) : monthsAgoRange(0);
  const rangeLengthDays = Math.round((new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const previousTo = new Date(`${range.from}T00:00:00Z`);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - (rangeLengthDays - 1));
  const previousRange: DateRange = { from: toIsoDate(previousFrom), to: toIsoDate(previousTo) };

  const [leads, setters, businessProfile, commentCounts] = await Promise.all([
    getLeads(accountId),
    getSetters(accountId),
    getBusinessProfile(accountId),
    getCommentCounts(accountId),
  ]);

  const stats = await computeLeadPipelineStats(accountId, range, previousRange, user?.sector ?? null);

  const chatContext: ChatContext = { topicType: "lever", topicKey: "ceo_vision", topicLabel: t("vision"), sourcePage: "acquisition_pipeline" };
  const falcoSkin = resolveFalcoSkin("/acquisition/pipeline");
  const offers = businessProfile.sales.offers;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          {fromDashboard && (
            <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-muted-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-accent/20">
              ← {t("backDashboard")}
            </Link>
          )}
          <Link href="/acquisition/pipeline/funnel" className="text-sm font-bold text-muted-foreground hover:underline">
            {t("dailyFunnel")} →
          </Link>
          <NewLeadDialog offers={offers} setters={setters} />
        </div>
      </div>

      <div className="flex w-fit items-center gap-1 rounded-[var(--radius-control)] border border-border bg-muted p-1" role="group" aria-label={t("viewAria")}>
        <Link
          href="/acquisition/pipeline?view=today"
          aria-current={view === "today" ? "page" : undefined}
          className={`min-h-11 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-bold ${view === "today" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t("todayView")}
        </Link>
        <Link
          href="/acquisition/pipeline?view=stage"
          aria-current={view === "stage" ? "page" : undefined}
          className={`min-h-11 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-bold ${view === "stage" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t("stageView")}
        </Link>
      </div>

      {view === "today" ? (
        <TodayPipelineView leads={leads} offers={offers} setters={setters} />
      ) : (
        <>
          <AgentBanner
            stateText={t("agentState")}
            ctaLabel={t("improve")}
            chatContext={chatContext}
            mode="optimiser"
            falcoSkin={falcoSkin}
          />
          <PipelineStatsBanner stats={stats} period={period} />
          <KanbanBoard
            initialLeads={leads}
            offers={offers}
            setters={setters}
            commentCounts={commentCounts}
            initialLeadId={targetLeadId}
          />
        </>
      )}
    </div>
  );
}
