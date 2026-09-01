import { describe, expect, it } from "vitest";

import { buildCallMatchFingerprint, capFalcoCandidateIds, normalizeMatchEmail, normalizeMatchHandle, normalizeMatchPhone, normalizeMatchText, rankCallMatchCandidates, type CallMatchCallInput, type CallMatchLeadInput } from "./call-matching";

const baseCall: CallMatchCallInput = {
  inviteeName: "Marc Lefebvre",
  inviteeEmail: null,
  inviteePhone: null,
  source: "iclosed",
  externalReference: "call-123",
  scheduledAt: "2026-08-18T14:00:00.000Z",
  eventType: "Coaching 1:1",
  closer: "Nadia D.",
  setterId: "setter-1",
};

function lead(overrides: Partial<CallMatchLeadInput> = {}): CallMatchLeadInput {
  return {
    id: "lead-1",
    displayName: "Marc Lefebvre",
    firstName: "Marc",
    lastName: "Lefebvre",
    normalizedHandle: "marc.lefebvre",
    canonicalProfileUrl: "https://instagram.com/marc.lefebvre",
    platform: "instagram",
    setterId: "setter-1",
    closer: "Nadia D.",
    createdAt: "2026-08-18T12:00:00.000Z",
    updatedAt: "2026-08-18T12:30:00.000Z",
    messageOccurredAt: "2026-08-18T10:00:00.000Z",
    capturedAt: null,
    ...overrides,
  };
}

describe("CRM call matching", () => {
  it("normalizes human-entered identity fields before comparing them", () => {
    expect(normalizeMatchText("Élodie  À  Paris")).toBe("elodie a paris");
    expect(normalizeMatchEmail("  LEA@Example.COM ")).toBe("lea@example.com");
    expect(normalizeMatchPhone("+33 (0)6 12 34 56 78")).toBe("330612345678");
    expect(normalizeMatchHandle("https://Instagram.com/Marc.Lefebvre")).toBe("marclefebvre");
  });

  it("gives a high-confidence result to an exact contact match", () => {
    const result = rankCallMatchCandidates({ ...baseCall, inviteeEmail: "marc@example.com", inviteePhone: "+33 6 12 34 56 78" }, [lead({ email: "MARC@example.com", phone: "0612345678" })]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ leadId: "lead-1", confidence: "high" });
    expect(result[0]?.reasonCodes).toEqual(expect.arrayContaining(["exact_email", "exact_phone", "name_match", "time_proximity"]));
  });

  it("keeps a name plus nearby lead activity reviewable but below high confidence", () => {
    const result = rankCallMatchCandidates(baseCall, [lead()]);

    expect(result[0]?.confidence).toBe("medium");
    expect(result[0]?.reasonCodes).toEqual(expect.arrayContaining(["name_match", "time_proximity", "attribution_match"]));
  });

  it("marks a name-only match as low confidence and flags duplicate names", () => {
    const result = rankCallMatchCandidates({ ...baseCall, inviteeName: "Sophie A.", scheduledAt: "2026-08-18T14:00:00.000Z" }, [
      lead({ id: "lead-2", displayName: "Sophie A.", firstName: "Sophie", lastName: "A.", platform: "linkedin", createdAt: "2026-06-01T10:00:00.000Z", messageOccurredAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z", setterId: null, closer: null }),
      lead({ id: "lead-3", displayName: "Sophie A.", firstName: "Sophie", lastName: "A.", platform: "instagram", createdAt: "2026-06-01T10:00:00.000Z", messageOccurredAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z", setterId: null, closer: null }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((candidate) => candidate.confidence === "low")).toBe(true);
    expect(result.every((candidate) => candidate.reasonCodes.includes("common_name"))).toBe(true);
  });

  it("caps Falco IDs to the deterministic shortlist and removes duplicates", () => {
    expect(capFalcoCandidateIds(["lead-2", "lead-2", "foreign", "lead-1", "lead-3"], new Set(["lead-1", "lead-2", "lead-3"]), 2)).toEqual(["lead-2", "lead-1"]);
  });

  it("changes the fingerprint when the deterministic evidence changes", () => {
    const ranked = rankCallMatchCandidates(baseCall, [lead()]);
    const original = buildCallMatchFingerprint(baseCall, ranked);
    const withEmail = { ...baseCall, inviteeEmail: "marc@example.com" };
    const enrichedRanked = rankCallMatchCandidates(withEmail, [lead({ email: "marc@example.com" })]);

    expect(buildCallMatchFingerprint(withEmail, enrichedRanked)).not.toBe(original);
  });
});
