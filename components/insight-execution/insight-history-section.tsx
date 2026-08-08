import { getJournalProjects } from "@/lib/journal/queries";
import {
  getAssignableMembers,
  getInsightHistory,
} from "@/lib/insight-execution/queries";

import { InsightHistoryList } from "./insight-history-list";

export async function InsightHistorySection({
  accountId,
  viewerUserId,
  canAssign = false,
}: {
  accountId: string;
  viewerUserId?: string;
  canAssign?: boolean;
}) {
  const [items, members, projects] = await Promise.all([
    getInsightHistory(accountId, {}, viewerUserId),
    canAssign ? getAssignableMembers(accountId) : Promise.resolve([]),
    getJournalProjects(accountId),
  ]);
  return (
    <InsightHistoryList
      items={items}
      members={members}
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
      }))}
      canAssign={canAssign}
    />
  );
}
