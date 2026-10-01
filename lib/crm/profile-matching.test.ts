import { describe, expect, it } from "vitest";

import { rankCrmProfileCandidates } from "./profile-matching";

const captured = {
  platform: "instagram" as const,
  canonicalProfileUrl: "https://instagram.com/alexandre_mepuis",
  normalizedHandle: "alexandre_mepuis",
  displayName: "Alexandre Mépuis",
  firstName: "Alexandre",
  lastName: "Mépuis",
  messageOccurredAt: null,
  capturedAt: "2026-10-01T12:00:00.000Z",
};

describe("CRM profile candidate ranking", () => {
  it("ranks exact contacts above normalized names and caps the response", () => {
    const ranked = rankCrmProfileCandidates({ ...captured, email: "alex@example.com" }, [
      { id: "name", displayName: "Alexandre Mepuis", normalizedHandle: "alexandre_mepuis", emailNormalized: null, phoneNormalized: null, updatedAt: new Date("2026-01-01"), profiles: [] },
      { id: "contact", displayName: "Un autre nom", normalizedHandle: "autre", emailNormalized: "alex@example.com", phoneNormalized: null, updatedAt: new Date("2025-01-01"), profiles: [] },
      ...Array.from({ length: 8 }, (_, index) => ({ id: `extra-${index}`, displayName: "Alexandre Mepuis", normalizedHandle: null, emailNormalized: null, phoneNormalized: null, updatedAt: new Date("2024-01-01"), profiles: [] })),
    ]);
    expect(ranked).toHaveLength(5);
    expect(ranked[0]).toEqual({ id: "contact", signals: ["email"], score: 100 });
    expect(ranked.some((item) => item.id === "name" && item.signals.includes("name"))).toBe(true);
  });

  it("keeps shared phones as explicit suggestions and never merges by itself", () => {
    const ranked = rankCrmProfileCandidates({ ...captured, phone: "+33687880310" }, [
      { id: "one", displayName: "A", normalizedHandle: null, emailNormalized: null, phoneNormalized: "+33687880310", updatedAt: new Date("2025-01-01"), profiles: [] },
      { id: "two", displayName: "B", normalizedHandle: null, emailNormalized: null, phoneNormalized: "+33687880310", updatedAt: new Date("2024-01-01"), profiles: [] },
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["one", "two"]);
    expect(ranked.every((item) => item.signals.includes("phone") && item.score === 100)).toBe(true);
  });

  it("matches accents and separators on a linked profile without treating it as exact URL", () => {
    const ranked = rankCrmProfileCandidates(captured, [{
      id: "whatsapp-lead",
      displayName: "Autre nom",
      normalizedHandle: "phone",
      emailNormalized: null,
      phoneNormalized: null,
      updatedAt: new Date("2025-01-01"),
      profiles: [{ normalizedHandle: "other_handle", searchNameNormalized: "alexandre mepuis" }],
    }]);
    expect(ranked).toEqual([{ id: "whatsapp-lead", signals: ["name"], score: 75 }]);
  });
});
