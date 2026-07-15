"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

export default function ConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // The default Supabase email template redirects here with the session
    // in the URL hash fragment — only the browser SDK can read that, a
    // server route handler never sees it. detectSessionInUrl (on by
    // default) picks it up as soon as this client mounts.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/onboarding");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/onboarding");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </div>
  );
}
