"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { disconnectStripe } from "../settings/actions";

export function StripeDisconnectButton() {
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
    <div className="flex flex-col items-start gap-2">
      <Button variant="destructive" onClick={handleDisconnect} disabled={isPending} className="shrink-0">
        {isPending ? "Déconnexion..." : "Déconnecter"}
      </Button>
      {error && <p className="text-sm text-state-critical">{error}</p>}
    </div>
  );
}
