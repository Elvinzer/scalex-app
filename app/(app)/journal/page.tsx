import { after } from "next/server";

import { ExecutionMomentumCard } from "@/components/insight-execution/execution-momentum-card";
import { FalcoJournalActions } from "@/components/insight-execution/falco-journal-actions";
import { getCurrentUser } from "@/lib/current-user";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { getJournalMonth, getJournalProjects, getJournalTodos } from "@/lib/journal/queries";
import { getInsightHistory } from "@/lib/insight-execution/queries";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";

import { JournalCalendar } from "./journal-calendar";
import { NextActions, type NextAction } from "./next-actions";
import { ProjectPanel } from "./project-panel";
import { TodayActionCard, type TodayAction } from "./today-action";
import { TodoPanel } from "./todo-panel";

const PERIOD_MONTHS = 3;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");
  const accountContext = await getAccountContext(userId);
  after(() => track("journal_viewed", userId));

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getUTCFullYear();
  const month = Number(params.month) || now.getUTCMonth() + 1;
  const todayIso = now.toISOString().slice(0, 10);

  const [daysMap, todos, projects, falcoInsights, businessProfile, kpiRawData, benchmarks] = await Promise.all([
    getJournalMonth(accountId, year, month),
    getJournalTodos(accountId),
    getJournalProjects(accountId),
    getInsightHistory(accountId, { sourceType: "copilote" }, userId),
    getBusinessProfile(accountId),
    getDiagnosticKpiRawData(accountId),
    getDiagnosticBenchmarks(user?.sector ?? null),
  ]);

  const days = Array.from(daysMap.values());

  // What to do today, and what follows — both from the diagnostic engine,
  // never from free-form input. This page tells the user what to work on;
  // the personal to-do panel below stays deliberately secondary.
  const months = lastCompletedMonths(PERIOD_MONTHS);
  const { settingTotals, closingTotals, cashContractedTotal, hasAnyMonthlyRow } = aggregatePeriodTotals({
    months,
    allMonthlyRows: kpiRawData.allMonthlyRows,
    allSettingEntries: kpiRawData.allSettingEntries,
    allClosingEntries: kpiRawData.allClosingEntries,
  });
  const allPoints = hasAnyMonthlyRow
    ? computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal })
    : [];
  const { toWatch } = hasAnyMonthlyRow
    ? await computeLeverOpportunities({
        accountId,
        businessProfile,
        settingTotals,
        closingTotals,
        cashContractedTotal,
        periodMonths: PERIOD_MONTHS,
        months,
      })
    : { toWatch: [] };

  const todayAction: TodayAction | null = allPoints[0]
    ? {
        metricKey: allPoints[0].key,
        label: allPoints[0].label,
        originLabel: `Vient de ton goulot : ${allPoints[0].label}`,
        explanation: allPoints[0].explanation,
        monthlyGainEur: allPoints[0].monthlyGain,
        chatContext: {
          topicType: "metric",
          topicKey: allPoints[0].key,
          topicLabel: allPoints[0].label,
          sourcePage: "journal_today_action",
        },
      }
    : null;

  const nextActions: NextAction[] = [
    ...allPoints.slice(1).map((point) => ({
      key: point.key,
      title: point.label,
      originLabel: `Diagnostic · ${point.category}`,
      effortLabel: "à évaluer",
      monthlyGainEur: point.monthlyGain,
      href: `/diagnostic?open=${point.key}`,
    })),
    ...[...toWatch]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((lever) => ({
        key: `lever-${lever.leverKey}`,
        title: lever.label,
        originLabel: `Levier · ${lever.category}`,
        effortLabel: "à évaluer",
        monthlyGainEur: lever.impactAmountEur,
        href: `/diagnostic?openLever=${lever.leverKey}&openLeverLabel=${encodeURIComponent(lever.label)}`,
      })),
  ].sort((a, b) => (b.monthlyGainEur ?? 0) - (a.monthlyGainEur ?? 0));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Journal de bord</h1>
        <p className="mt-1.5 text-sm font-bold text-muted-foreground">
          Ce qui s&apos;est passé, ce qu&apos;il reste à faire, où en sont tes projets.
        </p>
      </div>

      {/* Bloc 1 du brief — l'action du jour, seul bloc sombre de l'écran et
          seul bouton corail plein. Placée avant tout le reste : la page doit
          se lire en trois minutes, une action prioritaire en tête. */}
      {todayAction && <TodayActionCard action={todayAction} />}

      <ExecutionMomentumCard
        accountId={accountId}
        viewerUserId={userId}
        compact
        canOpenDiagnostic={accountContext?.isOwner || accountContext?.permissions.has("diagnostic")}
      />

      {/* Bloc 2 — ce qui suit l'action du jour, volontairement plus discret. */}
      <NextActions actions={nextActions} />

      <FalcoJournalActions
        items={falcoInsights.filter((item) => item.initiative !== null && ["launched", "completed"].includes(item.decision))}
      />

      <div className="grid gap-5 lg:grid-cols-[62%_1fr]">
        <JournalCalendar year={year} month={month} days={days} todayIso={todayIso} />

        <div className="flex flex-col gap-5 lg:min-w-[340px]">
          <TodoPanel
            todos={todos.map((t) => ({
              id: t.id,
              label: t.label,
              dueDate: t.dueDate,
              done: t.done,
              projectId: t.projectId,
              isBusinessImprovement: t.isBusinessImprovement,
            }))}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          />
          <ProjectPanel
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              deadline: p.deadline,
              milestones: p.milestones,
              status: p.status,
            }))}
            todos={todos.map((t) => ({ id: t.id, label: t.label, done: t.done, projectId: t.projectId }))}
          />
        </div>
      </div>
    </div>
  );
}
