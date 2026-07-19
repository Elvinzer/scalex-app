"use client";

import { useEffect } from "react";

import { identifyClient, initPostHogClient } from "@/lib/analytics-client";
import { createClient } from "@/lib/supabase/client";

// Mounted once in app/layout.tsx — initializes posthog-js and identifies
// the current session's user (bare distinct id; niche/mrr_current person
// properties are kept in sync separately, server-side, from
// app/(app)/business/actions.ts whenever identity is actually saved).
export function PostHogInit() {
  useEffect(() => {
    initPostHogClient();

    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user.id;
      if (userId) identifyClient(userId);
    });
  }, []);

  return null;
}
