"use client";

import { ExternalLink, Pause, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { z } from "zod";

import { applyMetaCampaignAction } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";
import { MetaAdsConsentDialog } from "./meta-ads-consent-dialog";

const storedProposalSchema = z.object({ idempotencyKey: z.string().uuid() });

type Props = {
  entityType: "adset" | "ad";
  entityId: string;
  campaignId: string;
  status: string | null;
  deepLink: string;
  hasWriteAccess: boolean;
  accountLabel?: string | null;
  returnTo?: string;
};

export function MetaEntityAction({ entityType, entityId, campaignId, status, deepLink, hasWriteAccess, accountLabel, returnTo }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [resultLink, setResultLink] = useState<string | null>(null);
  const [writeAccessRequired, setWriteAccessRequired] = useState(false);
  const storageKey = `scale-x-meta-entity-action:${entityType}:${entityId}`;
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored === "1") {
        const legacyKey = crypto.randomUUID();
        window.sessionStorage.setItem(storageKey, JSON.stringify({ idempotencyKey: legacyKey }));
        return legacyKey;
      }
      const parsed = storedProposalSchema.safeParse(stored ? JSON.parse(stored) : null);
      return parsed.success ? parsed.data.idempotencyKey : null;
    } catch {
      return null;
    }
  });
  const isProposed = idempotencyKey !== null;
  const [isPending, startTransition] = useTransition();
  const isPaused = status === "PAUSED";
  const isArchived = status === "ARCHIVED";
  const actionType = isPaused ? "resume" : "pause";
  const writeAccessHref = `/api/meta/upgrade?return_to=${encodeURIComponent(returnTo ?? `/acquisition/ads/meta/${campaignId}`)}`;

  function propose() {
    const nextIdempotencyKey = crypto.randomUUID();
    setIdempotencyKey(nextIdempotencyKey);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ idempotencyKey: nextIdempotencyKey }));
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
    if (!hasWriteAccess || writeAccessRequired) {
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
        idempotencyKey: idempotencyKey ?? undefined,
      });
      setResultLink(result.deepLink ?? deepLink);
      if (result.needsWriteAccess) {
        setWriteAccessRequired(true);
        const retryKey = crypto.randomUUID();
        setIdempotencyKey(retryKey);
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify({ idempotencyKey: retryKey }));
        } catch {
          // The retry remains usable when browser storage is unavailable.
        }
      }
      setMessage(result.error ?? "Action vérifiée dans Meta Ads.");
      if (!result.error) {
        setIdempotencyKey(null);
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // Ignore storage failures after the action has already succeeded.
        }
      }
    });
  }

  const writeAccessUnavailable = !hasWriteAccess || writeAccessRequired;

  return (
    <div className="flex min-w-[10rem] flex-col items-end gap-1">
      {isProposed && writeAccessUnavailable ? (
        <MetaAdsConsentDialog
          mode="write"
          href={writeAccessHref}
          accountLabel={accountLabel ?? "compte publicitaire sélectionné"}
          triggerLabel={writeAccessRequired ? "Autoriser à nouveau puis reprendre" : "Autoriser puis reprendre"}
          triggerVariant="outline"
          triggerClassName="w-full"
        />
      ) : (
        <Button variant="outline" size="sm" onClick={apply} disabled={isPending || isArchived}>
          {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {isPending ? "Vérification…" : isProposed ? isPaused ? "Confirmer la reprise" : "Confirmer la pause" : isPaused ? "Proposer la reprise" : "Proposer la pause"}
        </Button>
      )}
      {isProposed && !hasWriteAccess && <span className="max-w-[13rem] text-right text-[11px] text-muted-foreground">La proposition est conservée sur cet appareil.</span>}
      {isProposed && (
        <div className="max-w-[18rem] rounded-[var(--radius-control)] border border-accent-2/30 bg-accent-2/5 p-3 text-left text-[11px]">
          <p className="font-bold">Proposition : {isPaused ? "réactiver" : "mettre en pause"} {entityType === "adset" ? "cet ensemble" : "cette publicité"}</p>
          <dl className="mt-2 space-y-1 text-muted-foreground">
            <div><dt className="inline font-bold">État actuel : </dt><dd className="inline">{status ?? "inconnu"}</dd></div>
            <div><dt className="inline font-bold">Nouvelle valeur : </dt><dd className="inline">{isPaused ? "ACTIVE" : "PAUSED"}</dd></div>
            <div><dt className="inline font-bold">Justification : </dt><dd className="inline">Demande explicite de pilotage depuis Scale X.</dd></div>
            <div><dt className="inline font-bold">Impact / risque : </dt><dd className="inline">{isPaused ? "Reprise possible de dépense ; relire le volume après diffusion." : "Interruption de diffusion ; risque de perdre du volume pendant la pause."}</dd></div>
          </dl>
          <a href={deepLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-bold underline-offset-4 hover:underline">Ouvrir dans Meta Ads <ExternalLink className="size-3" /></a>
          <p className="mt-2 text-muted-foreground">La valeur sera relue avant l’écriture ; toute divergence arrête l’action.</p>
        </div>
      )}
      {message && <span className="max-w-[13rem] text-right text-[11px] text-muted-foreground">{message}</span>}
      {resultLink && (
        <a href={resultLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold underline-offset-4 hover:underline">
          Meta Ads <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
