"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { refreshCalendlyCalls } from "@/app/(app)/integrations/calendly-actions";
import { refreshIclosedCalls } from "@/app/(app)/integrations/iclosed-actions";
import { Button } from "@/components/ui/button";

// Pulls the account's calls on demand from whichever tools are connected (no
// webhook on iClosed, and dev Inngest isn't always running) — the reliable way
// to bring data in / refresh outcomes.
export function RefreshCallsButton({ iclosed = false, calendly = false }: { iclosed?: boolean; calendly?: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    setMessage(null);
    startTransition(async () => {
      let imported = 0;
      const errors: string[] = [];
      if (iclosed) {
        const r = await refreshIclosedCalls();
        if (r.error) errors.push(r.error);
        else imported += r.imported ?? 0;
      }
      if (calendly) {
        const r = await refreshCalendlyCalls();
        if (r.error) errors.push(r.error);
        else imported += r.imported ?? 0;
      }
      if (errors.length > 0) {
        setIsError(true);
        setMessage(errors[0]);
      } else {
        setIsError(false);
        setMessage(
          imported > 0 ? `${imported} nouvel${imported > 1 ? "s" : ""} appel${imported > 1 ? "s" : ""} importé${imported > 1 ? "s" : ""}.` : "Déjà à jour."
        );
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {message && <span className={`text-sm ${isError ? "text-state-critical" : "text-muted-foreground"}`}>{message}</span>}
      <Button variant="outline" onClick={handleRefresh} disabled={isPending}>
        <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Synchronisation…" : "Rafraîchir mes appels"}
      </Button>
    </div>
  );
}
