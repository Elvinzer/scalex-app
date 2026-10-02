import type { CrmLeadStage } from "./types";

export type PendingCrmStageOperation = {
  stage: CrmLeadStage;
  idempotencyKey: string;
};

export type CrmStageOperationResolution =
  | { state: "new" | "retry"; idempotencyKey: string }
  | { state: "conflict" };

export function resolveCrmStageOperation(
  pendingOperations: Map<string, PendingCrmStageOperation>,
  leadId: string,
  stage: CrmLeadStage,
  createIdempotencyKey: () => string,
): CrmStageOperationResolution {
  const existing = pendingOperations.get(leadId);
  if (existing) {
    return existing.stage === stage
      ? { state: "retry", idempotencyKey: existing.idempotencyKey }
      : { state: "conflict" };
  }

  const idempotencyKey = createIdempotencyKey();
  pendingOperations.set(leadId, { stage, idempotencyKey });
  return { state: "new", idempotencyKey };
}
