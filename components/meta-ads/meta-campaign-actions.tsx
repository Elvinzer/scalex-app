"use client";

import { ExternalLink, Pause, Play, Save, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { z } from "zod";

import { applyMetaCampaignAction } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";
import { MetaAdsConsentDialog } from "./meta-ads-consent-dialog";

type ActionType = "pause" | "resume" | "set_daily_budget";

type Proposal = {
  actionType: ActionType;
  dailyBudgetCents?: number;
  idempotencyKey: string;
};

const storedProposalSchema = z.object({
  actionType: z.enum(["pause", "resume", "set_daily_budget"]),
  dailyBudgetCents: z.number().int().positive().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

type Props = {
  campaignId: string;
  status: string | null;
  dailyBudgetCents: number | null;
  hasWriteAccess: boolean;
  accountLabel?: string | null;
  deepLink?: string | null;
  returnTo?: string;
};

export function MetaCampaignActions({ campaignId, status, dailyBudgetCents, hasWriteAccess, accountLabel, deepLink: campaignDeepLink, returnTo }: Props) {
  const t = useTranslations("app.ads.actions");
  const [budget, setBudget] = useState(dailyBudgetCents === null ? "" : String(Math.round(dailyBudgetCents / 100)));
  const storageKey = `minaly-meta-action:${campaignId}`;
  const [proposal, setProposal] = useState<Proposal | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (!stored) return null;
      const parsed = storedProposalSchema.safeParse(JSON.parse(stored));
      if (!parsed.success) return null;
      const idempotencyKey = parsed.data.idempotencyKey ?? crypto.randomUUID();
      if (!parsed.data.idempotencyKey) window.sessionStorage.setItem(storageKey, JSON.stringify({ ...parsed.data, idempotencyKey }));
      return { ...parsed.data, idempotencyKey };
    } catch {
      return null;
    }
  });
  const [message, setMessage] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [writeAccessRequired, setWriteAccessRequired] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isPaused = status === "PAUSED";
  const isArchived = status === "ARCHIVED";
  const writeAccessHref = `/api/meta/upgrade?return_to=${encodeURIComponent(returnTo ?? `/acquisition/ads/meta/${campaignId}`)}`;

  function propose(actionType: ActionType, value?: number) {
    setMessage(null);
    setDeepLink(null);
    if (isArchived && actionType === "resume") {
      setMessage(t("archiveMessage"));
      return;
    }
    if (actionType === "set_daily_budget" && (!value || value < 1)) {
      setMessage(t("budgetError"));
      return;
    }
    const nextProposal = { actionType, dailyBudgetCents: actionType === "set_daily_budget" && value ? Math.round(value * 100) : undefined, idempotencyKey: crypto.randomUUID() };
    setProposal(nextProposal);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(nextProposal));
    } catch {
      // The proposal remains usable when browser storage is unavailable.
    }
  }

  function confirmProposal() {
    if (!proposal) return;
    if (!hasWriteAccess || writeAccessRequired) {
      setMessage(t("permissionError"));
      return;
    }
    if (proposal.actionType === "pause" && !window.confirm(t("pauseConfirm"))) return;
    const action = proposal;
    setMessage(null);
    setDeepLink(null);
    startTransition(async () => {
      const result = await applyMetaCampaignAction({
        campaignId,
        actionType: action.actionType,
        dailyBudgetCents: action.dailyBudgetCents,
        expectedStatus: action.actionType === "pause" || action.actionType === "resume" ? status ?? undefined : undefined,
        expectedDailyBudgetCents: action.actionType === "set_daily_budget" ? dailyBudgetCents : undefined,
        idempotencyKey: action.idempotencyKey,
      });
      setDeepLink(result.deepLink ?? null);
      if (result.needsWriteAccess) {
        setWriteAccessRequired(true);
        const retryProposal = { ...action, idempotencyKey: crypto.randomUUID() };
        setProposal(retryProposal);
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(retryProposal));
        } catch {
          // The retry remains usable when browser storage is unavailable.
        }
      }
      if (result.needsWriteAccess) {
        setMessage(t("permissionRequired"));
      } else if (result.error) {
        setMessage(result.error);
      } else {
        setMessage(t("verified"));
        setProposal(null);
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // Ignore storage failures after the action has already succeeded.
        }
      }
    });
  }

  const variation = proposal?.actionType === "set_daily_budget" && proposal.dailyBudgetCents !== undefined && dailyBudgetCents !== null && dailyBudgetCents > 0
    ? ((proposal.dailyBudgetCents - dailyBudgetCents) / dailyBudgetCents) * 100
    : null;
  const writeAccessUnavailable = !hasWriteAccess || writeAccessRequired;
  const actionLabel = proposal?.actionType === "pause" ? t("pause") : proposal?.actionType === "resume" ? t("resume") : t("budget");
  const statusText = status === "ACTIVE" ? t("active") : status === "PAUSED" ? t("paused") : status === "ARCHIVED" ? t("archivedStatus") : status ?? t("unknown");

  return (
    <div className="sticker-card p-6">
      <div>
        <p className="font-bold">{t("title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {!proposal && !hasWriteAccess && (
        <p className="mt-4 text-sm text-muted-foreground">{t("permissionHelp")}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => propose(isPaused ? "resume" : "pause")} disabled={isPending || isArchived}>
          {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {isArchived ? t("archived") : isPaused ? t("proposeResume") : t("proposePause")}
        </Button>
        <div className="flex items-center gap-2">
          <label htmlFor="meta-daily-budget" className="sr-only">{t("budgetLabel")}</label>
          <input
            id="meta-daily-budget"
            inputMode="decimal"
            type="number"
            min="1"
            step="1"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            className="h-9 w-28 rounded-[var(--radius-control)] border border-border bg-card px-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            placeholder={t("budgetPlaceholder")}
          />
          <Button variant="outline" onClick={() => propose("set_daily_budget", Number(budget))} disabled={isPending}>
            <Save className="size-4" />
            {t("proposeBudget")}
          </Button>
        </div>
      </div>
      {proposal && (
        <div className="mt-5 rounded-[var(--radius-control)] border border-accent-2/30 bg-accent-2/5 p-4" aria-labelledby="meta-action-proposal-title">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-accent-2" />
            <div className="min-w-0 flex-1">
              <p id="meta-action-proposal-title" className="font-bold">{t("proposal", { action: actionLabel })}</p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">{t("currentState")}</dt><dd className="font-bold">{statusText}{dailyBudgetCents !== null ? ` · ${Math.round(dailyBudgetCents / 100)} €/jour` : ""}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t("newValue")}</dt><dd className="font-bold">{proposal.actionType === "pause" ? "PAUSED" : proposal.actionType === "resume" ? "ACTIVE" : `${Math.round((proposal.dailyBudgetCents ?? 0) / 100)} €/jour`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t("budgetVariation")}</dt><dd className="font-bold">{proposal.actionType === "set_daily_budget" ? (variation === null ? t("unknownBase") : `${variation >= 0 ? "+" : ""}${variation.toFixed(0)} %`) : "—"}</dd></div>
              </dl>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div><dt className="font-bold text-muted-foreground">{t("justification")}</dt><dd>{t("justificationText")}</dd></div>
                <div><dt className="font-bold text-muted-foreground">{t("impact")}</dt><dd>{proposal.actionType === "pause" ? t("pauseImpact") : proposal.actionType === "resume" ? t("resumeImpact") : t("budgetImpact")}</dd></div>
                <div><dt className="font-bold text-muted-foreground">{t("risk")}</dt><dd>{proposal.actionType === "pause" ? t("pauseRisk") : proposal.actionType === "resume" ? t("resumeRisk") : t("budgetRisk")}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="text-muted-foreground">{t("reread")}</span>
                {campaignDeepLink && <a href={campaignDeepLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold underline-offset-4 hover:underline">{t("openMeta")} <ExternalLink className="size-3.5" /></a>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {writeAccessUnavailable ? (
                  <MetaAdsConsentDialog
                    mode="write"
                    href={writeAccessHref}
                    accountLabel={accountLabel ?? t("unknown")}
                    triggerLabel={t("authorizeResume")}
                    triggerVariant="accent2"
                  />
                ) : (
                  <Button variant="accent2" onClick={confirmProposal} disabled={isPending}>{isPending ? t("checking") : t("confirmApply")}</Button>
                )}
                <Button variant="outline" onClick={() => setProposal(null)} disabled={isPending}>{t("cancel")}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {message && <p className="mt-3 text-sm font-bold text-muted-foreground" role="status">{message}</p>}
      {deepLink && (
        <a href={deepLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold underline-offset-4 hover:underline">
          {t("openMeta")} <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}
