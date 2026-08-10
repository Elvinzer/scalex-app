"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { disconnectStripe } from "../settings/actions";

export function StripeDisconnectButton() {
  const t = useTranslations("common.actions");
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
        {isPending ? t("disconnecting") : t("disconnect")}
      </Button>
      {error && <p className="text-sm text-state-critical">{error}</p>}
    </div>
  );
}
