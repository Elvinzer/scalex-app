"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { resolvePostAuthDestination } from "./actions";

export default function ConfirmPage() {
  const router = useRouter();
  const navigated = useRef(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    const inviteToken = searchParams.get("invite");

    // New PKCE links go straight to /auth/callback. Keep forwarding here so
    // links sent before that change still get exchanged by the server route,
    // which can write the session cookies for the App Router.
    if (code) {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("code", code);
      if (inviteToken) callbackUrl.searchParams.set("invite", inviteToken);
      window.location.replace(callbackUrl.toString());
      return;
    }

    const supabase = createClient();

    // Older implicit-flow links can report an auth error in the query string.
    if (searchParams.get("error") || searchParams.get("error_description")) {
      setHasError(true);
      return;
    }

    let disposed = false;

    // Checked server-side (resolvePostAuthDestination) instead of always
    // sending every login through /onboarding first — onboarding is a
    // once-per-new-account flow, an existing account should never even
    // transiently land on it.
    async function goToDestination() {
      if (disposed || navigated.current) return;
      navigated.current = true;
      try {
        const destination = inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : await resolvePostAuthDestination();
        if (!disposed) router.replace(destination);
      } catch {
        if (!disposed) {
          navigated.current = false;
          setHasError(true);
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void goToDestination();
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (disposed) return;
        if (error) {
          setHasError(true);
          return;
        }
        if (data.session) void goToDestination();
      })
      .catch(() => {
        if (!disposed) setHasError(true);
      });

    const timeoutId = window.setTimeout(() => {
      if (!disposed && !navigated.current) setHasError(true);
    }, 10000);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [router]);

  if (hasError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-state-critical">This sign-in link is invalid or has expired.</p>
        <a className="text-sm font-medium text-accent underline underline-offset-4" href="/sign-in">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">Signing in...</p>
    </div>
  );
}
