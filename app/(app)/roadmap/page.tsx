import { after } from "next/server";

import { NoAccessState } from "./no-access-state";
import { RoadmapView, type RoadmapProject, type RoadmapTodo } from "./roadmap-view";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/current-user";
import { getJournalActionLoopData, measureDueJournalActions } from "@/lib/journal/action-loop";
import { getJournalMonth, getJournalProjects, getJournalTodos } from "@/lib/journal/queries";
import { getStreakSnapshot } from "@/lib/streak/queries";
import { getCallRoadmapRecommendations } from "@/lib/closing-videos/queries";
import { toIsoDate, todayUtc } from "@/lib/date-range";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";
import { measureAsync } from "@/lib/perf/timing";
import { withTimeout } from "@/lib/perf/with-timeout";

type RoadmapPageProps = {
  searchParams: Promise<{ year?: string | string[]; month?: string | string[] }>;
};

function queryNumber(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : fallback;
}

export default function RoadmapPage(props: RoadmapPageProps) {
  return measureAsync("page.roadmap", () => withTimeout(renderRoadmapPage(props), 20_000, "roadmap-render"));
}

async function renderRoadmapPage({ searchParams }: RoadmapPageProps) {
  const params = await searchParams;
  const now = todayUtc();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const yearCandidate = queryNumber(params.year, currentYear);
  const monthCandidate = queryNumber(params.month, currentMonth);
  const year = yearCandidate >= 2000 && yearCandidate <= 2100 ? yearCandidate : currentYear;
  const month = monthCandidate >= 1 && monthCandidate <= 12 ? monthCandidate : currentMonth;
  const { userId, accountId, user } = await getCurrentUser();
  const context = await getAccountContext(userId);
  if (context && !context.isOwner && !context.permissions.has("dashboard")) {
    return <NoAccessState />;
  }
  await requirePermissionOrRedirect(userId, "dashboard");

  const [data, streak, callRoadmapRecommendations, journalTodos, journalProjects, journalDays] = await withTimeout(
    Promise.all([
      getJournalActionLoopData(accountId, user?.sector ?? null),
      // The app shell has already refreshed this request's snapshot for the
      // sidebar flame, so this is a request-local cache hit.
      getStreakSnapshot(accountId),
      getCallRoadmapRecommendations(accountId),
      getJournalTodos(accountId),
      getJournalProjects(accountId),
      getJournalMonth(accountId, year, month),
    ]),
    18_000,
    "roadmap-data",
  );

  const todos: RoadmapTodo[] = journalTodos.map((todo) => ({
    id: todo.id,
    label: todo.label,
    dueDate: todo.dueDate,
    done: todo.done,
    projectId: todo.projectId,
    isBusinessImprovement: todo.isBusinessImprovement,
  }));
  const projects: RoadmapProject[] = journalProjects.map((project) => ({ id: project.id, name: project.name }));

  after(() => {
    void track("roadmap_viewed", userId);
    void measureDueJournalActions(accountId, userId);
  });

  return (
    <RoadmapView
      accountId={accountId}
      data={data}
      streak={streak}
      callRoadmapRecommendations={callRoadmapRecommendations}
      todos={todos}
      projects={projects}
      journalDays={[...journalDays.values()]}
      calendarYear={year}
      calendarMonth={month}
      todayIso={toIsoDate(now)}
    />
  );
}
