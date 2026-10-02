import { z } from "zod";

import { CRM_CHANNELS, CRM_LEAD_SOURCES } from "./types";

export const crmCaptureDraftSchema = z.object({
  identity: z.string().max(500).optional(),
  displayName: z.string().max(160).optional(),
  platform: z.enum(CRM_CHANNELS).optional(),
  source: z.enum(CRM_LEAD_SOURCES).optional(),
  idempotencyKey: z.string().trim().min(8).max(240).optional(),
});

export type CrmCaptureDraft = z.infer<typeof crmCaptureDraftSchema>;

export type CrmDraftStorage = Pick<Storage, "getItem" | "removeItem">;

/** Restores a valid draft without consuming it; callers clear it only after save acknowledgement. */
export function restoreCrmDraft<T>(storage: CrmDraftStorage, key: string, schema: z.ZodType<T>): T | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;

  try {
    const result = schema.safeParse(JSON.parse(raw));
    if (result.success) return result.data;
  } catch {
    // Invalid serialized draft is discarded below.
  }

  storage.removeItem(key);
  return null;
}
