"use server";

import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { withTimeout } from "@/lib/perf/with-timeout";
import { getAccountContext } from "@/lib/team/context";

import { getSidebarScaleScoreData, type SidebarScaleScoreData } from "@/components/app-sidebar-with-scale-score";

export async function loadSidebarScaleScore(): Promise<SidebarScaleScoreData | null> {
  try {
    const { userId, accountId, user } = await getCurrentUser();
    const context = await getAccountContext(userId);
    if (!context || (!context.isOwner && !context.permissions.has("dashboard"))) return null;

    const businessProfile = await withTimeout(getBusinessProfile(accountId), 5_000, "sidebar-score-profile");
    return await withTimeout(getSidebarScaleScoreData({
      accountId,
      businessProfile,
      sector: user?.sector ?? null,
      canSeeScaleScore: true,
      callTrackingConnected: Boolean(user?.iclosedConnected || user?.calendlyConnected),
    }), 5_000, "sidebar-scale-score");
  } catch {
    return null;
  }
}
