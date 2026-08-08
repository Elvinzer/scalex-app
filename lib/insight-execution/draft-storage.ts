import { z } from "zod";

export const insightDraftSchema = z.object({
  title: z.string(),
  problem: z.string(),
  actionText: z.string(),
  successCriterion: z.string(),
});

export type InsightDraft = z.infer<typeof insightDraftSchema>;

function keyFor(conversationId: string): string {
  return `scalex:falco-insight-draft:${conversationId}`;
}

export function readInsightDraft(storage: Pick<Storage, "getItem"> | null, conversationId: string): InsightDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(keyFor(conversationId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = insightDraftSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writeInsightDraft(storage: Pick<Storage, "setItem"> | null, conversationId: string, draft: InsightDraft): void {
  if (!storage) return;
  try {
    storage.setItem(keyFor(conversationId), JSON.stringify(draft));
  } catch {
    // Storage is an enhancement; it must never block the conversation.
  }
}

export function clearInsightDraft(storage: Pick<Storage, "removeItem"> | null, conversationId: string): void {
  if (!storage) return;
  try {
    storage.removeItem(keyFor(conversationId));
  } catch {
    // Storage is an enhancement; it must never block the conversation.
  }
}
