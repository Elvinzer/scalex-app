import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { funnelStageInsights } from "@/db/schema";
import type { FunnelStageKey } from "@/lib/agent/knowledge";
import type { ExistingStageInsight } from "@/components/funnel-insights/stage-insight-panel";

// Shared by the Funnel overview accordion and the Setting/Closing tile grids
// (now at /acquisition/setting and /ventes/closing) so all three read the
// same per-stage AI insight already generated for this user — the LATEST
// one, since funnelStageInsights is an append-only history (see
// app/(app)/funnel/insights/page.tsx for the full history view).
export async function getExistingStageInsights(
  userId: string
): Promise<Partial<Record<FunnelStageKey, ExistingStageInsight>>> {
  const rows = await db
    .select({ stage: funnelStageInsights.stage, insightText: funnelStageInsights.insightText })
    .from(funnelStageInsights)
    .where(eq(funnelStageInsights.userId, userId))
    .orderBy(desc(funnelStageInsights.generatedAt));

  const latestByStage: Partial<Record<FunnelStageKey, ExistingStageInsight>> = {};
  for (const row of rows) {
    if (!(row.stage in latestByStage)) {
      latestByStage[row.stage] = { insightText: row.insightText };
    }
  }
  return latestByStage;
}
