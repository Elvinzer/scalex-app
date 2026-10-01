import { describe, expect, it } from "vitest";

import { detectPlatform, normalizeCapturedProfile, normalizeProfileUrl } from "./normalization";

describe("CRM social identity normalization", () => {
  it("canonicalizes Instagram URLs without tracking data", () => {
    expect(normalizeProfileUrl("instagram", "https://WWW.Instagram.com/Marc.Lefebvre/?igsh=abc#bio")).toBe("https://instagram.com/marc.lefebvre");
  });

  it("canonicalizes LinkedIn profile paths", () => {
    expect(normalizeProfileUrl("linkedin", "https://www.linkedin.com/in/Marc-Lefebvre/?trk=feed")).toBe("https://linkedin.com/in/marc-lefebvre");
  });

  it("accepts the other profile platforms", () => {
    expect(normalizeProfileUrl("tiktok", "https://www.tiktok.com/@Marc.Lefebvre?lang=fr")).toBe("https://tiktok.com/@marc.lefebvre");
    expect(normalizeProfileUrl("x", "https://x.com/Marc.Lefebvre?lang=fr")).toBe("https://x.com/marc.lefebvre");
  });

  it("rejects non-profile routes and unsupported hosts", () => {
    expect(normalizeProfileUrl("instagram", "https://instagram.com/explore")).toBeNull();
    expect(normalizeProfileUrl("linkedin", "https://example.com/in/marc")).toBeNull();
    expect(detectPlatform("https://example.com/marc")).toBeNull();
  });

  it("keeps message and capture timestamps separate", () => {
    expect(
      normalizeCapturedProfile({
        profileUrl: "https://instagram.com/marc.lefebvre?utm_source=crm",
        displayName: "Marc Lefebvre",
        messageOccurredAt: "2026-09-01T08:00:00.000Z",
        capturedAt: "2026-09-01T10:00:00.000Z",
      })
    ).toMatchObject({
      normalizedHandle: "marc.lefebvre",
      firstName: "Marc",
      lastName: "Lefebvre",
      messageOccurredAt: "2026-09-01T08:00:00.000Z",
      capturedAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("keeps non-profile channels usable without inventing a profile URL", () => {
    expect(normalizeCapturedProfile({ platform: "whatsapp", handle: "14 Geraldo", displayName: "14 Geraldo" })).toMatchObject({
      platform: "whatsapp",
      canonicalProfileUrl: null,
      normalizedHandle: "14 geraldo",
    });
  });
});
