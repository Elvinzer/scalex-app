import { describe, expect, it } from "vitest";

import {
  canAccessAssignedInitiative,
  canTransitionInitiative,
  decisionForInitiativeStatus,
} from "./state";

describe("initiative access", () => {
  it("lets the owner access every initiative in the account", () => {
    expect(canAccessAssignedInitiative(true, null, null)).toBe(true);
    expect(canAccessAssignedInitiative(true, "member-a", "member-b")).toBe(true);
  });

  it("limits a member to actions assigned to that member", () => {
    expect(canAccessAssignedInitiative(false, "member-a", "member-a")).toBe(true);
    expect(canAccessAssignedInitiative(false, "member-b", "member-a")).toBe(false);
    expect(canAccessAssignedInitiative(false, null, "member-a")).toBe(false);
    expect(canAccessAssignedInitiative(false, null, null)).toBe(false);
  });
});

describe("initiative state machine", () => {
  it("allows the execution path from planned to measured", () => {
    expect(canTransitionInitiative("planned", "in_progress")).toBe(true);
    expect(canTransitionInitiative("in_progress", "completed")).toBe(true);
    expect(canTransitionInitiative("completed", "awaiting_measurement")).toBe(true);
    expect(canTransitionInitiative("awaiting_measurement", "measured")).toBe(true);
  });

  it("does not reopen an immutable measured result", () => {
    expect(canTransitionInitiative("measured", "in_progress")).toBe(false);
    expect(canTransitionInitiative("measured", "completed")).toBe(false);
  });

  it("maps initiative progress to the insight decision lifecycle", () => {
    expect(decisionForInitiativeStatus("planned")).toBe("launched");
    expect(decisionForInitiativeStatus("in_progress")).toBe("launched");
    expect(decisionForInitiativeStatus("awaiting_measurement")).toBe("completed");
    expect(decisionForInitiativeStatus("measured")).toBe("completed");
  });
});
