import { describe, expect, it } from "vitest";

import { formatCrmDate, formatCrmDateTime } from "./format";

const instant = new Date("2026-10-06T09:45:00.000Z");

describe("CRM date formatting", () => {
  it("formats dates consistently for French and English", () => {
    expect(formatCrmDate(instant, "fr", "Europe/Paris")).toBe("6 oct. 2026");
    expect(formatCrmDate(instant, "en", "Europe/Paris")).toBe("Oct 6, 2026");
    expect(formatCrmDate(instant, "fr", "Europe/Paris", "short")).toBe("06/10/2026");
    expect(formatCrmDate(instant, "en", "Europe/Paris", "short")).toBe("10/6/26");
  });

  it("formats the same instant in the requested time zone", () => {
    expect(formatCrmDateTime(instant, "fr", "Europe/Paris")).toBe("6 oct. 2026 à 11:45");
    expect(formatCrmDateTime(instant, "en", "Europe/Paris")).toBe("Oct 6, 2026, 11:45 AM");
    expect(formatCrmDateTime(instant, "fr", "America/Los_Angeles", "short")).toBe("06/10/2026 à 2:45");
  });
});
