"use client";

import { useEffect } from "react";

import { identifyClient, initPostHogClient } from "@/lib/analytics-client";

// Mounted once in app/layout.tsx — initializes posthog-js and identifies
// the current session's user (bare distinct id; niche/mrr_current person
// properties are kept in sync separately, server-side, from
// app/(app)/business/actions.ts whenever identity is actually saved).
export function PostHogInit() {
  useEffect(() => {
    let cancelled = false;
    const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1));
    const idleId = schedule(() => {
      if (cancelled) return;
      initPostHogClient();
      void import("@/lib/supabase/client").then(({ createClient }) => {
        if (cancelled) return;
        return createClient().auth.getSession();
      }).then((result) => {
        const userId = result?.data.session?.user.id;
        if (!cancelled && userId) identifyClient(userId);
      });
    });

    return () => {
      cancelled = true;
      if (typeof idleId === "number" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, []);

  return null;
}
