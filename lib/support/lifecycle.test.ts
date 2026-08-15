import { describe, expect, it } from "vitest";

import { canReadSupportMessage, statusAfterStaffPublicReply, statusAfterUserReply } from "@/lib/support/lifecycle";

describe("support lifecycle", () => {
  it("moves a waiting user ticket back to triage after a user reply", () => {
    expect(statusAfterUserReply("waiting_on_user")).toBe("triage");
    expect(statusAfterUserReply("in_progress")).toBe("in_progress");
  });

  it("marks a staff public answer as waiting for the user", () => {
    expect(statusAfterStaffPublicReply("in_progress")).toBe("waiting_on_user");
    expect(statusAfterStaffPublicReply("closed")).toBe("closed");
  });

  it("keeps internal notes staff-only", () => {
    expect(canReadSupportMessage({ visibility: "public", isStaff: false })).toBe(true);
    expect(canReadSupportMessage({ visibility: "internal", isStaff: false })).toBe(false);
    expect(canReadSupportMessage({ visibility: "internal", isStaff: true })).toBe(true);
  });
});

