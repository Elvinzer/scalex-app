import { after } from "next/server";

import { JournalView } from "./journal-view";
import { getCurrentUser } from "@/lib/current-user";
import { track } from "@/lib/analytics";
import { getJournalActionLoopData, measureDueJournalActions } from "@/lib/journal/action-loop";
import { getJournalProjects, getJournalTodos } from "@/lib/journal/queries";
import { getStreakSnapshot } from "@/lib/streak/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

export default async function JournalPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");

  const [data, todos, projects, streak] = await Promise.all([
    getJournalActionLoopData(accountId),
    getJournalTodos(accountId),
    getJournalProjects(accountId),
    // Cache hit: the (app) layout already refreshed this request's snapshot
    // for the sidebar flame.
    getStreakSnapshot(accountId),
  ]);

  after(() => {
    void track("journal_viewed", userId);
    void measureDueJournalActions(accountId, userId);
  });

  return (
    <JournalView
      data={data}
      todos={todos.map((todo) => ({
        id: todo.id,
        label: todo.label,
        dueDate: todo.dueDate,
        done: todo.done,
        projectId: todo.projectId,
        isBusinessImprovement: todo.isBusinessImprovement,
      }))}
      projects={projects.map((project) => ({ id: project.id, name: project.name }))}
      streak={streak}
    />
  );
}

