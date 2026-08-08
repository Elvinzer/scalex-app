import { after } from "next/server";

import { JournalView } from "./journal-view";
import { getCurrentUser } from "@/lib/current-user";
import { track } from "@/lib/analytics";
import { getJournalActionLoopData, measureDueJournalActions } from "@/lib/journal/action-loop";
import { getJournalProjects, getJournalTodos } from "@/lib/journal/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

export default async function JournalPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");

  const [data, todos, projects] = await Promise.all([
    getJournalActionLoopData(accountId),
    getJournalTodos(accountId),
    getJournalProjects(accountId),
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
    />
  );
}

