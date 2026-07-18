import { eq } from "drizzle-orm";

import { db } from "@/db";
import { funnelStageInsights } from "@/db/schema";
import type { FunnelStageKey } from "@/lib/agent/knowledge";

import type { ExistingStageInsight } from "./stage-insight-panel";

// Shared by the overview accordion and the Setting/Closing tile grids so all
// three read the same per-stage AI insights already generated for this user.
export async function getExistingStageInsights(
  userId: string
): Promise<Partial<Record<FunnelStageKey, ExistingStageInsight>>> {
  const rows = await db
    .select({ stage: funnelStageInsights.stage, insightText: funnelStageInsights.insightText })
    .from(funnelStageInsights)
    .where(eq(funnelStageInsights.userId, userId));

  return Object.fromEntries(rows.map((row) => [row.stage, { insightText: row.insightText }]));
}
