"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

const DURATION_MS = 600; // matches --motion-slow's semantic (counters are the one explicit exception to "600ms cap")

// Animates 0 → value once. `sessionKey` (optional) remembers "already
// played" in sessionStorage so a re-render/navigation within the same
// browser session doesn't replay it — count-ups are a first-impression
// moment, not a repeatable effect. Pauses if the tab is backgrounded
// (Page Visibility API) and skips straight to the final value under
// prefers-reduced-motion, per the motion-system brief's non-negotiable rule.
export function CountUp({
  value,
  sessionKey,
  format = (n) => Math.round(n).toString(),
  className,
}: {
  value: number;
  sessionKey?: string;
  format?: (n: number) => string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const alreadyPlayed = sessionKey ? typeof window !== "undefined" && sessionStorage.getItem(sessionKey) === "played" : false;
  const [display, setDisplay] = useState(reducedMotion || alreadyPlayed ? value : 0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion || alreadyPlayed) {
      setDisplay(value);
      return;
    }

    let start: number | null = null;

    function step(timestamp: number) {
      if (document.hidden) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic, matches --ease-out's intent
      setDisplay(value * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else if (sessionKey) {
        sessionStorage.setItem(sessionKey, "played");
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden && frameRef.current === null) {
        frameRef.current = requestAnimationFrame(step);
      }
    }

    frameRef.current = requestAnimationFrame(step);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reducedMotion]);

  return <span className={className}>{format(display)}</span>;
}
