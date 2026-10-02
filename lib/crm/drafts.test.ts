import { describe, expect, it } from "vitest";

import { crmCaptureDraftSchema, restoreCrmDraft, type CrmDraftStorage } from "./drafts";

function createStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  const storage: CrmDraftStorage = {
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => { entries.delete(key); },
  };
  return { storage, entries };
}

describe("CRM mobile draft restoration", () => {
  it("keeps a valid capture draft available until the save is acknowledged", () => {
    const key = "minaly.crm.capture-draft";
    const serialized = JSON.stringify({
      identity: "@camille",
      displayName: "Camille",
      platform: "instagram",
      source: "instagram",
      idempotencyKey: "capture-operation-0001",
    });
    const { storage, entries } = createStorage({ [key]: serialized });

    expect(restoreCrmDraft(storage, key, crmCaptureDraftSchema)).toEqual({
      identity: "@camille",
      displayName: "Camille",
      platform: "instagram",
      source: "instagram",
      idempotencyKey: "capture-operation-0001",
    });
    expect(entries.get(key)).toBe(serialized);
  });

  it.each(["{", JSON.stringify({ platform: "unsupported" })])(
    "discards malformed or invalid drafts instead of trusting session storage",
    (serialized) => {
      const key = "minaly.crm.capture-draft";
      const { storage, entries } = createStorage({ [key]: serialized });

      expect(restoreCrmDraft(storage, key, crmCaptureDraftSchema)).toBeNull();
      expect(entries.has(key)).toBe(false);
    },
  );
});
