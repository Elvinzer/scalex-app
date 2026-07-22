"use client";

import { createContext, useContext } from "react";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

// Mounted once in app/(app)/layout.tsx with the user's own
// reduceFalcoAnimations preference (already fetched there for other
// purposes) — every Falco animation component reads it through
// useFalcoAnimationsEnabled below instead of threading a prop through
// every intermediate component.
const FalcoReduceAnimationsContext = createContext(false);

export function FalcoPreferencesProvider({
  reduceAnimations,
  children,
}: {
  reduceAnimations: boolean;
  children: React.ReactNode;
}) {
  return <FalcoReduceAnimationsContext.Provider value={reduceAnimations}>{children}</FalcoReduceAnimationsContext.Provider>;
}

// Single point of truth combining BOTH signals that should suppress Falco's
// animations — the OS-level prefers-reduced-motion (lib/hooks/use-reduced-motion.ts)
// and the user's own in-app toggle (Réglages). Either one being true means
// no typewriter, no bounce/shake/tilt, poses just fade.
export function useFalcoAnimationsEnabled(): boolean {
  const systemReduced = useReducedMotion();
  const userReduced = useContext(FalcoReduceAnimationsContext);
  return !systemReduced && !userReduced;
}
