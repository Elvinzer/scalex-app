"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

import { resolvePostAuthDestination } from "./actions";

export default function ConfirmPage() {
  const router = useRouter();
  const navigated = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    // Read directly off window.location instead of useSearchParams() — this
    // page is entirely client-rendered (no SSR content depends on the
    // query), and it avoids the Suspense boundary useSearchParams() would
    // otherwise require. A team member accepting an invite never goes
    // through the business-owner onboarding wizard — see
    // app/invite/[token]/page.tsx.
    const inviteToken = new URLSearchParams(window.location.search).get("invite");

    // Checked server-side (resolvePostAuthDestination) instead of always
    // sending every login through /onboarding first — onboarding is a
    // once-per-new-account flow, an existing account should never even
    // transiently land on it.
    async function goToDestination() {
      if (navigated.current) return;
      navigated.current = true;
      const destination = inviteToken ? `/invite/${inviteToken}` : await resolvePostAuthDestination();
      router.replace(destination);
    }

    // The default Supabase email template redirects here with the session
    // in the URL hash fragment — only the browser SDK can read that, a
    // server route handler never sees it. detectSessionInUrl (on by
    // default) picks it up as soon as this client mounts.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void goToDestination();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void goToDestination();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </div>
  );
}
