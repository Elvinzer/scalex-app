"use client";

import { useEffect, useState } from "react";

// The CSS `@media (prefers-reduced-motion: reduce)` block in globals.css
// already disables every pure-CSS animation. This hook exists only for the
// handful of JS-driven effects that CSS can't gate on its own (count-up,
// canvas-confetti) — it's the one non-negotiable check they must make
// before animating at all.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return reduced;
}
