import { describe, expect, it } from "vitest";

import { clearInsightDraft, readInsightDraft, writeInsightDraft, type InsightDraft } from "./draft-storage";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("Copilote draft storage", () => {
  const draft: InsightDraft = {
    title: "Proposer plus tôt",
    problem: "Le timing est tardif.",
    actionText: "Tester après qualification.",
    successCriterion: "Faire le point dans 7 jours.",
  };

  it("round-trips a draft per conversation", () => {
    const store = storage();
    writeInsightDraft(store, "00000000-0000-0000-0000-000000000001", draft);
    expect(readInsightDraft(store, "00000000-0000-0000-0000-000000000001")).toEqual(draft);
    expect(readInsightDraft(store, "00000000-0000-0000-0000-000000000002")).toBeNull();
  });

  it("clears a saved draft and tolerates malformed storage", () => {
    const store = storage();
    writeInsightDraft(store, "00000000-0000-0000-0000-000000000001", draft);
    clearInsightDraft(store, "00000000-0000-0000-0000-000000000001");
    expect(readInsightDraft(store, "00000000-0000-0000-0000-000000000001")).toBeNull();
    store.setItem("scalex:falco-insight-draft:bad", "not-json");
    expect(readInsightDraft(store, "bad")).toBeNull();
  });
});
