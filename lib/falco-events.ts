import type { FalcoPose } from "@/components/falco/falco";

import type { FalcoReactionAnimation } from "./falco-motion";

// A one-shot reaction Falco plays when something noteworthy just happened at
// a call site that already has a visible <Falco> — never a standalone toast
// or notification system, always a lookup into this table applied to the
// existing element. Add new keys here only; never hand-roll a reaction
// animation inline at a call site.
export type FalcoEventKey = "value_imported" | "rate_improved" | "benign_error_parsing";

const REACTION_CLASS_NAME: Record<FalcoReactionAnimation, string> = {
  nod: "falco-nod",
  "happy-bounce": "falco-happy-bounce",
  "tilt-neutral": "falco-tilt-neutral",
};

export const FALCO_REACTIONS: Record<FalcoEventKey, { pose: FalcoPose; animation: FalcoReactionAnimation }> = {
  value_imported: { pose: "happy", animation: "nod" },
  rate_improved: { pose: "happy", animation: "happy-bounce" },
  benign_error_parsing: { pose: "alert", animation: "tilt-neutral" },
};

// Resolves an event key straight to the CSS class to apply on the <Falco>
// element — callers never need to know the class names in app/globals.css.
export function falcoReactionClassName(eventKey: FalcoEventKey): string {
  return REACTION_CLASS_NAME[FALCO_REACTIONS[eventKey].animation];
}
