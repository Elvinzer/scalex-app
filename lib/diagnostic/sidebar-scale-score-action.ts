"use server";

import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { withDatabaseReadTimeout } from "@/lib/perf/database-read";
import { getAccountContext } from "@/lib/team/context";

import { getSidebarScaleScoreData, type SidebarScaleScoreData } from "@/components/app-sidebar-with-scale-score";

export async function loadSidebarScaleScore(): Promise<SidebarScaleScoreData | null> {
  try {
    const { userId, accountId, user } = await getCurrentUser();
    const context = await getAccountContext(userId);
    if (!context || (!context.isOwner && !context.permissions.has("dashboard"))) return null;

    const businessProfile = await withDatabaseReadTimeout(
      () => getBusinessProfile(accountId),
      { operation: "sidebar-score-profile", timeoutMs: 5_000, attempts: 1 },
    );
    return await withDatabaseReadTimeout(
      () => getSidebarScaleScoreData({
        accountId,
        businessProfile,
        sector: user?.sector ?? null,
        canSeeScaleScore: true,
        callTrackingConnected: Boolean(user?.iclosedConnected || user?.calendlyConnected),
      }),
      { operation: "sidebar-scale-score", timeoutMs: 5_000, attempts: 1 },
    );
  } catch {
    return null;
  }
}
