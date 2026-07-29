"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { refreshIclosedCalls } from "@/app/(app)/integrations/iclosed-actions";
import { Button } from "@/components/ui/button";

export function RefreshCallsButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshIclosedCalls();
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setIsError(false);
        const n = result.imported ?? 0;
        setMessage(n > 0 ? `${n} nouvel${n > 1 ? "s" : ""} appel${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""}.` : "Déjà à jour.");
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
