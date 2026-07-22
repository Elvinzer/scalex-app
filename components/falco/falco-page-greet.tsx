"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { Falco, type FalcoPose, type FalcoSize } from "./falco";
import { useFalcoAnimationsEnabled } from "./falco-context";

const SESSION_KEY_PREFIX = "falco-greeted-";

// Falco's own entrance on a page's hero, played once per tab per page (not
// once per day like DailyReportDialog's localStorage gate — a page-greet is
// "per visit", so sessionStorage is the right primitive: cleared when the
// tab closes, untouched by hiding/refocusing the tab, so it never replays
// just from switching tabs back.
export function FalcoPageGreet({
  pageKey,
  pose,
  size = "sm",
  bubbleText,
  className,
}: {
  pageKey: string;
  pose?: FalcoPose;
  size?: FalcoSize;
  bubbleText?: string;
  className?: string;
}) {
  const animationsEnabled = useFalcoAnimationsEnabled();
  // Starts false so the very first client paint matches the server's
  // (which has no sessionStorage) — the effect below flips it right after
  // mount, which still triggers the CSS animation since it's a fresh class
  // application, not a replay of an already-mounted one.
  const [shouldGreet, setShouldGreet] = useState(false);

  useEffect(() => {
    const key = SESSION_KEY_PREFIX + pageKey;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    setShouldGreet(true);
  }, [pageKey]);

  return (
    <Falco
      pose={pose}
      size={size}
      withBubble={!!bubbleText}
      bubbleText={bubbleText}
      className={cn(shouldGreet && animationsEnabled && "falco-page-greet", className)}
    />
  );
}
