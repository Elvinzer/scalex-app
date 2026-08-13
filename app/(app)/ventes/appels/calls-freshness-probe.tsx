"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef } from "react";

import { requestIclosedUpcomingSync } from "@/app/(app)/integrations/iclosed-actions";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_CHECK_GAP_MS = 4 * 60 * 1000;
const REFRESH_DELAYS_MS = [4_000, 15_000] as const;
const SESSION_CHECK_KEY = "minaly:iclosed-upcoming-check:v1";

// Invisible client-side coordinator for the server-side reconciliation. It
// runs once when the page opens, again after five minutes while the tab stays
// visible, and on a return to the tab. There is no tight polling loop: the
// worker's database cooldown is the final guard against duplicate provider
// requests across tabs and Vercel instances.
export function CallsFreshnessProbe({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const mountedRef = useRef(true);
  const lastRequestRef = useRef(0);
  const refreshTimersRef = useRef<number[]>([]);

  const requestCheck = useCallback(() => {
    if (!enabled || document.visibilityState !== "visible") return;

    const now = Date.now();
    if (now - lastRequestRef.current < SESSION_CHECK_GAP_MS) return;

    try {
      const previous = Number(window.sessionStorage.getItem(SESSION_CHECK_KEY) ?? 0);
      if (Number.isFinite(previous) && now - previous < SESSION_CHECK_GAP_MS) return;
      window.sessionStorage.setItem(SESSION_CHECK_KEY, String(now));
    } catch {
      // Storage can be disabled in privacy mode. The in-memory ref and the
      // database claim still keep this tab/account bounded.
    }

    lastRequestRef.current = now;
    startTransition(() => {
      void requestIclosedUpcomingSync()
        .then(({ queued }) => {
          if (!mountedRef.current) return;
          if (!queued) {
            router.refresh();
            return;
          }
          for (const delay of REFRESH_DELAYS_MS) {
            const timer = window.setTimeout(() => {
              if (mountedRef.current) router.refresh();
            }, delay);
            refreshTimersRef.current.push(timer);
          }
        })
        .catch(() => {
          // A failed enqueue must not turn an otherwise usable calls page into
          // an error state. The next visible check retries automatically.
        });
    });
  }, [enabled, router]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    requestCheck();
    const interval = window.setInterval(requestCheck, CHECK_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestCheck();
    };
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", requestCheck);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      for (const timer of refreshTimersRef.current) window.clearTimeout(timer);
      refreshTimersRef.current = [];
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", requestCheck);
    };
  }, [enabled, requestCheck]);

  return null;
}
