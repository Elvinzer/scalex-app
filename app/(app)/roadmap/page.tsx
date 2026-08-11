import { after } from "next/server";

import { RoadmapView } from "./roadmap-view";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/current-user";
import { getJournalActionLoopData, measureDueJournalActions } from "@/lib/journal/action-loop";
import { getRecentWeeklyReports } from "@/lib/dashboard/weekly-report";
import { getStreakSnapshot } from "@/lib/streak/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { measureAsync } from "@/lib/perf/timing";

export default function RoadmapPage() {
  return measureAsync("page.roadmap", renderRoadmapPage);
}

async function renderRoadmapPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");

  const [data, streak, weeklyReports] = await Promise.all([
    getJournalActionLoopData(accountId),
    // The app shell has already refreshed this request's snapshot for the
    // sidebar flame, so this is a request-local cache hit.
    getStreakSnapshot(accountId),
    getRecentWeeklyReports(accountId, 4),
  ]);

  after(() => {
    void track("roadmap_viewed", userId);
    void measureDueJournalActions(accountId, userId);
  });

  return <RoadmapView accountId={accountId} data={data} streak={streak} weeklyReports={weeklyReports} />;
}
