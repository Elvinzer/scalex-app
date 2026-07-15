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

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to {email}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to Scale X</h1>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Work email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@yourbusiness.com"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      {status === "error" && (
        <p className="rounded-lg border border-state-critical/30 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
          We couldn&apos;t send the link. Try again.
        </p>
      )}

      <Button size="lg" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending..." : "Send magic link"}
      </Button>
    </form>
  );
}
