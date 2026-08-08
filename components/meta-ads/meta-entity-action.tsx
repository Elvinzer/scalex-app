"use client";

import { ExternalLink, Pause, Play } from "lucide-react";
import { useState, useTransition } from "react";

import { applyMetaCampaignAction } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";
import { MetaAdsConsentDialog } from "./meta-ads-consent-dialog";

type Props = {
  entityType: "adset" | "ad";
  entityId: string;
  campaignId: string;
  status: string | null;
  deepLink: string;
  hasWriteAccess: boolean;
  accountLabel?: string | null;
};

export function MetaEntityAction({ entityType, entityId, campaignId, status, deepLink, hasWriteAccess, accountLabel }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [resultLink, setResultLink] = useState<string | null>(null);
  const storageKey = `scale-x-meta-entity-action:${entityType}:${entityId}`;
  const [isProposed, setIsProposed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const [isPending, startTransition] = useTransition();
  const isPaused = status === "PAUSED";
  const isArchived = status === "ARCHIVED";
  const actionType = isPaused ? "resume" : "pause";
  const writeAccessHref = `/api/meta-ads/write-access?return_to=${encodeURIComponent(`/acquisition/ads/meta/${campaignId}`)}`;

  function propose() {
    setIsProposed(true);
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // The proposal remains usable when browser storage is unavailable.
    }
  }

  function apply() {
    if (isArchived) {
      setMessage("Cette publicité est archivée dans Meta Ads.");
      return;
    }
    if (!isProposed) {
      propose();
      return;
    }
    if (!hasWriteAccess) {
      setMessage("Autorise ads_management avant toute modification.");
      return;
    }
    if (actionType === "pause" && !window.confirm("Cette action va interrompre cette diffusion dans Meta Ads. Confirmer ?")) return;
    setMessage(null);
    setResultLink(null);
    startTransition(async () => {
      const result = await applyMetaCampaignAction({
        entityType,
        entityId,
        actionType,
        expectedStatus: status ?? undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setResultLink(result.deepLink ?? deepLink);
      setMessage(result.error ?? "Action vérifiée dans Meta Ads.");
      if (!result.error) {
        setIsProposed(false);
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // Ignore storage failures after the action has already succeeded.
        }
      }
    });
  }

  return (
    <div className="flex min-w-[10rem] flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={apply} disabled={isPending || isArchived}>
        {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        {isPending ? "Vérification…" : isProposed ? isPaused ? "Confirmer la reprise" : "Confirmer la pause" : isPaused ? "Proposer la reprise" : "Proposer la pause"}
      </Button>
      {isProposed && !hasWriteAccess && (
        <MetaAdsConsentDialog
          mode="write"
          href={writeAccessHref}
          accountLabel={accountLabel ?? "compte publicitaire sélectionné"}
          triggerLabel="Autoriser puis reprendre"
          triggerVariant="link"
          triggerClassName="h-auto min-h-0 p-0 text-right text-[11px] text-accent-2"
        />
      )}
      {isProposed && !hasWriteAccess && <span className="max-w-[13rem] text-right text-[11px] text-muted-foreground">La proposition est conservée sur cet appareil.</span>}
      {isProposed && hasWriteAccess && <span className="max-w-[13rem] text-right text-[11px] text-muted-foreground">La relecture Meta sera faite avant l’écriture.</span>}
      {message && <span className="max-w-[13rem] text-right text-[11px] text-muted-foreground">{message}</span>}
      {resultLink && (
        <a href={resultLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold underline-offset-4 hover:underline">
          Meta Ads <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
