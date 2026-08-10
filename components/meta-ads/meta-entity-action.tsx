"use client";

import { ExternalLink, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("app.ads.entityAction");
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
      setMessage(t("archived"));
      return;
    }
    if (!isProposed) {
      propose();
      return;
    }
    if (!hasWriteAccess || writeAccessRequired) {
      setMessage(t("permission"));
      return;
    }
    if (actionType === "pause" && !window.confirm(t("pauseConfirm"))) return;
    setMessage(null);
    setResultLink(null);
    startTransition(async () => {
      const result = await applyMetaCampaignAction({
        entityType,
        entityId,
        campaignId,
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
      setMessage(result.error ?? t("verified"));
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
          accountLabel={accountLabel ?? t("account")}
          triggerLabel={writeAccessRequired ? t("authorizeAgain") : t("authorize")}
          triggerVariant="outline"
          triggerClassName="w-full"
        />
      ) : (
        <Button variant="outline" size="sm" onClick={apply} disabled={isPending || isArchived}>
          {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {isPending ? t("checking") : isProposed ? isPaused ? t("confirmResume") : t("confirmPause") : isPaused ? t("proposeResume") : t("proposePause")}
        </Button>
      )}
      {isProposed && !hasWriteAccess && <span className="max-w-[13rem] text-right text-[11px] text-muted-foreground">{t("stored")}</span>}
      {isProposed && (
        <div className="max-w-[18rem] rounded-[var(--radius-control)] border border-accent-2/30 bg-accent-2/5 p-3 text-left text-[11px]">
          <p className="font-bold">{t("proposal", { action: isPaused ? t("reactivate") : t("pause"), entity: entityType === "adset" ? t("adset") : t("ad") })}</p>
          <dl className="mt-2 space-y-1 text-muted-foreground">
            <div><dt className="inline font-bold">{t("currentState")} </dt><dd className="inline">{status ?? "unknown"}</dd></div>
            <div><dt className="inline font-bold">{t("newValue")} </dt><dd className="inline">{isPaused ? "ACTIVE" : "PAUSED"}</dd></div>
            <div><dt className="inline font-bold">{t("justification")} </dt><dd className="inline">{t("justificationText")}</dd></div>
            <div><dt className="inline font-bold">{t("impactRisk")} </dt><dd className="inline">{isPaused ? t("resumeImpact") : t("pauseImpact")}</dd></div>
          </dl>
          <a href={deepLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-bold underline-offset-4 hover:underline">{t("openMeta")} <ExternalLink className="size-3" /></a>
          <p className="mt-2 text-muted-foreground">{t("reread")}</p>
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
