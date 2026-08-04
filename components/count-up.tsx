"use client";

import { useEffect, useState } from "react";
import { animate } from "motion";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion-tokens";

// Animates 0 → value once. `sessionKey` (optional) remembers "already
// played" in sessionStorage so a re-render/navigation within the same
// browser session doesn't replay it — count-ups are a first-impression
// moment, not a repeatable effect. Skips rendering intermediate frames
// while the tab is backgrounded (Page Visibility API) — motion's own
// animation clock keeps running regardless, so returning to the tab shows
// wherever real elapsed time put it, same behavior as the original
// requestAnimationFrame implementation this replaced. Skips straight to
// the final value under prefers-reduced-motion, per the motion-system
// brief's non-negotiable rule.
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

  useEffect(() => {
    if (reducedMotion || alreadyPlayed) {
      setDisplay(value);
      return;
    }

    const controls = animate(0, value, {
      duration: MOTION_DURATION.slow, // counters are the one explicit exception to the "600ms cap"
      ease: MOTION_EASE.out,
      onUpdate: (latest) => {
        if (!document.hidden) setDisplay(latest);
      },
      onComplete: () => {
        setDisplay(value);
        if (sessionKey) sessionStorage.setItem(sessionKey, "played");
      },
    });

    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reducedMotion]);

  return <span className={className}>{format(display)}</span>;
}
