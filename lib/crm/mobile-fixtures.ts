export const MOBILE_SETTER_WORKFLOW_STATES = [
  "new",
  "contacted",
  "responded",
  "qualified",
  "booked",
  "no_show",
  "lost",
  "reopened",
  "sold",
] as const;

export type MobileSetterWorkflowState = (typeof MOBILE_SETTER_WORKFLOW_STATES)[number];

export type MobileSetterLoopFixture = {
  day: number;
  iteration: number;
  leadId: string;
  state: MobileSetterWorkflowState;
  operationKey: string;
  expectedTapBudget: number;
  network: "normal" | "slow";
};

export type MobileSetterLoopSummary = {
  loops: number;
  days: number;
  uniqueLeadIds: number;
  duplicateOperationKeys: number;
  slowNetworkLoops: number;
  loopsByDay: Record<string, number>;
  states: Record<MobileSetterWorkflowState, number>;
};

export function createMobileSetterLoopFixture(loopCount = 250): MobileSetterLoopFixture[] {
  if (!Number.isInteger(loopCount) || loopCount < 1) throw new RangeError("loopCount must be a positive integer");

  return Array.from({ length: loopCount }, (_, index) => {
    const day = Math.floor(index / 50) + 1;
    const iteration = (index % 50) + 1;
    const leadId = `mobile-fixture-lead-${String(index + 1).padStart(3, "0")}`;
    return {
      day,
      iteration,
      leadId,
      state: MOBILE_SETTER_WORKFLOW_STATES[index % MOBILE_SETTER_WORKFLOW_STATES.length],
      operationKey: `mobile-fixture-day-${day}-lead-${iteration}`,
      expectedTapBudget: 3,
      network: index % 25 === 24 ? "slow" : "normal",
    };
  });
}

export function summarizeMobileSetterLoop(fixture: MobileSetterLoopFixture[]): MobileSetterLoopSummary {
  const states = Object.fromEntries(MOBILE_SETTER_WORKFLOW_STATES.map((state) => [state, 0])) as Record<MobileSetterWorkflowState, number>;
  const loopsByDay: Record<string, number> = {};
  const leadIds = new Set<string>();
  const operationKeys = new Set<string>();
  let duplicateOperationKeys = 0;
  let slowNetworkLoops = 0;

  for (const loop of fixture) {
    states[loop.state] += 1;
    loopsByDay[String(loop.day)] = (loopsByDay[String(loop.day)] ?? 0) + 1;
    leadIds.add(loop.leadId);
    if (operationKeys.has(loop.operationKey)) duplicateOperationKeys += 1;
    operationKeys.add(loop.operationKey);
    if (loop.network === "slow") slowNetworkLoops += 1;
  }

  return {
    loops: fixture.length,
    days: Object.keys(loopsByDay).length,
    uniqueLeadIds: leadIds.size,
    duplicateOperationKeys,
    slowNetworkLoops,
    loopsByDay,
    states,
  };
}
