"use server";

import { z } from "zod";

import { completeJournalAction, startJournalAction } from "@/app/(app)/journal/action-loop-actions";
import { track } from "@/lib/analytics";
import { requireUserIdOrError } from "@/lib/current-user";
import { JOURNAL_ACTION_TYPES } from "@/lib/journal/action-generator";

const roadmapActionSchema = z.object({
  category: z.enum(["content", "sales", "team"]),
  type: z.enum(JOURNAL_ACTION_TYPES),
  sourceId: z.string().trim().min(1).max(160),
});

const roadmapStageSchema = z.enum(["in_progress", "upcoming", "done"]);

async function trackForCurrentUser(event: Parameters<typeof track>[0], properties: Record<string, unknown>): Promise<void> {
  const userId = await requireUserIdOrError();
  if (typeof userId === "string") await track(event, userId, properties);
}

export async function startRoadmapAction(input: unknown): Promise<{ error: string | null; initiativeId?: string }> {
  const parsed = roadmapActionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Action invalide." };

  const result = await startJournalAction({ type: parsed.data.type, sourceId: parsed.data.sourceId });
  if (!result.error) {
    await trackForCurrentUser("daily_action_started", { category: parsed.data.category });
  }
  return result;
}

export async function completeRoadmapAction(input: unknown): Promise<{ error: string | null }> {
  const parsed = roadmapActionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Action invalide." };

  const result = await completeJournalAction({ type: parsed.data.type, sourceId: parsed.data.sourceId });
  if (!result.error) {
    await trackForCurrentUser("daily_action_completed", { category: parsed.data.category });
  }
  return result;
}

export async function recordRoadmapItemClicked(stage: string): Promise<void> {
  const parsed = roadmapStageSchema.safeParse(stage);
  if (!parsed.success) return;
  await trackForCurrentUser("roadmap_item_clicked", { stage: parsed.data });
}

export async function recordBottleneckCtaClicked(metricKey: string): Promise<void> {
  const parsed = z.string().trim().min(1).max(80).safeParse(metricKey);
  if (!parsed.success) return;
  await trackForCurrentUser("bottleneck_cta_clicked", { metric_key: parsed.data });
}
