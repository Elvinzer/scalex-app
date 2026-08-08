import type { InitiativeStatus } from "./types";

export function canAccessAssignedInitiative(
  isOwner: boolean,
  assignedTeamMemberId: string | null,
  viewerTeamMemberId: string | null,
): boolean {
  return (
    isOwner ||
    (viewerTeamMemberId !== null &&
      assignedTeamMemberId === viewerTeamMemberId)
  );
}

const ALLOWED_TRANSITIONS: Record<InitiativeStatus, readonly InitiativeStatus[]> = {
  planned: ["in_progress", "paused", "completed", "cancelled"],
  in_progress: ["planned", "paused", "completed", "cancelled"],
  paused: ["planned", "in_progress", "cancelled"],
  completed: ["in_progress", "awaiting_measurement", "cancelled"],
  awaiting_measurement: ["in_progress", "measured", "cancelled"],
  measured: [],
  cancelled: ["planned"],
};

export function canTransitionInitiative(from: InitiativeStatus, to: InitiativeStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function decisionForInitiativeStatus(status: InitiativeStatus): "todo" | "launched" | "completed" {
  if (status === "completed" || status === "awaiting_measurement" || status === "measured") return "completed";
  return "launched";
}

export const INITIATIVE_STATUS_LABELS: Record<InitiativeStatus, string> = {
  planned: "Planifiée",
  in_progress: "En cours",
  paused: "En pause",
  completed: "Terminée",
  awaiting_measurement: "En attente de mesure",
  measured: "Résultat mesuré",
  cancelled: "Écartée",
};
