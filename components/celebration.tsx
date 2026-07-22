"use client";

import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

// Design-system colors only — no confetti library defaults.
const COLORS = ["#e8663c", "#5dcaa5", "#faf9f6", "#6d5cf6"];

// One-shot confetti burst, ~1.2s, ~40 particles. canvas-confetti is imported
// dynamically on first trigger only — it never enters the initial bundle.
// Disabled under prefers-reduced-motion (no confetti at all, not a
// slowed-down version) per the motion-system's non-negotiable rule.
export function Celebration({ trigger }: { trigger: boolean }) {
  const reducedMotion = useReducedMotion();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!trigger || firedRef.current || reducedMotion) return;
    firedRef.current = true;

    void import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 40,
        spread: 70,
        startVelocity: 35,
        gravity: 1.1,
        ticks: 90, // ~1.2s at 60fps
        origin: { y: 0.6 },
        colors: COLORS,
        disableForReducedMotion: true,
      });
    });
  }, [trigger, reducedMotion]);

  return null;
}
