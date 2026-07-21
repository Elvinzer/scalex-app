"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

// Same auth primitives as app/(auth)/sign-in/sign-in-form.tsx, but the email
// is locked to the invite's address and the redirect carries `?invite=` so
// app/auth/confirm and app/auth/callback route back here instead of
// /onboarding once the session is established.
export function InviteSignInForm({ email, token }: { email: string; token: string }) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleMagicLink() {
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?invite=${token}` },
    });
    setStatus(error ? "error" : "sent");
  }

  async function handleGoogleSignIn() {
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?invite=${token}` },
    });
    if (error) setStatus("error");
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-2 text-center">
        <p className="font-bold">Vérifie ta boîte mail</p>
        <p className="text-sm text-muted-foreground">On a envoyé un lien de connexion à {email}.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="outline" size="lg" onClick={handleGoogleSignIn} disabled={status === "sending"}>
        Continuer avec Google ({email})
      </Button>
      <Button type="button" size="lg" onClick={handleMagicLink} disabled={status === "sending"}>
        {status === "sending" ? "Envoi..." : `Recevoir un lien de connexion à ${email}`}
      </Button>
      {status === "error" && (
        <p className="text-center text-sm text-state-critical">Une erreur est survenue, réessaie.</p>
      )}
    </div>
  );
}
