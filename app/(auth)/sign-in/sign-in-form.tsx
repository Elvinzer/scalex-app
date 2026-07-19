"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    setStatus(error ? "error" : "sent");
  }

  async function handleGoogleSignIn() {
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    // Pas de "sent" ici : un succès redirige immédiatement vers Google.
    if (error) setStatus("error");
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-medium">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to {email}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-medium">Sign in to Scale X</h1>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleGoogleSignIn}
        disabled={status === "sending"}
        className="gap-2"
      >
        <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2.1 1.5-4.7 2.4-7.7 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5c3.6 6.6 10.1 11.2 17.8 11.2z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.6 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"
          />
        </svg>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Work email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@yourbusiness.com"
            className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          />
        </label>

        {status === "error" && (
          <p className="rounded-lg border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm text-state-critical">
            We couldn&apos;t send the link. Try again.
          </p>
        )}

        <Button size="lg" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending..." : "Send magic link"}
        </Button>
      </form>
    </div>
  );
}
