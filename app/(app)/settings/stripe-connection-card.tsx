"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { disconnectStripe } from "./actions";

export function StripeConnectionCard({ stripeConnectId }: { stripeConnectId: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectStripe();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="sticker-card p-8">
      <p className="text-sm font-bold text-muted-foreground">Stripe</p>
      {stripeConnectId ? (
        <>
          <div className="mt-2 flex items-center gap-2">
            <span className="size-2 rounded-full bg-state-healthy" />
            <p className="text-sm font-bold">Connecté : {stripeConnectId}</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pour changer de compte Stripe, déconnecte-toi puis reconnecte-toi avec l&apos;autre compte.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>
              {isPending ? "Déconnexion..." : "Déconnecter"}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-state-critical">{error}</p>}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Connecte ton compte Stripe pour lancer le diagnostic.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <a href="/api/stripe/connect">Connecter Stripe</a>
          </Button>
        </>
      )}
    </div>
  );
}
