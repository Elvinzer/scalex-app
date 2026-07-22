import { after } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { track } from "@/lib/analytics";
import { getJournalMonth, getJournalProjects, getJournalTodos } from "@/lib/journal/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { JournalCalendar } from "./journal-calendar";
import { ProjectPanel } from "./project-panel";
import { TodoPanel } from "./todo-panel";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");
  after(() => track("journal_viewed", userId));

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getUTCFullYear();
  const month = Number(params.month) || now.getUTCMonth() + 1;
  const todayIso = now.toISOString().slice(0, 10);

  const [daysMap, todos, projects] = await Promise.all([
    getJournalMonth(accountId, year, month),
    getJournalTodos(accountId),
    getJournalProjects(accountId),
  ]);

  const days = Array.from(daysMap.values());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Journal de bord</h1>
        <p className="mt-1.5 text-sm font-bold text-muted-foreground">
          Ce qui s&apos;est passé, ce qu&apos;il reste à faire, où en sont tes projets.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[62%_1fr]">
        <JournalCalendar year={year} month={month} days={days} todayIso={todayIso} />

        <div className="flex min-w-[340px] flex-col gap-5">
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
