"use client";

import { ExternalLink, Pause, Play, Save, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { z } from "zod";

import { applyMetaCampaignAction } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";
import { MetaAdsConsentDialog } from "./meta-ads-consent-dialog";

type ActionType = "pause" | "resume" | "set_daily_budget";

type Proposal = {
  actionType: ActionType;
  dailyBudgetCents?: number;
};

const storedProposalSchema = z.object({
  actionType: z.enum(["pause", "resume", "set_daily_budget"]),
  dailyBudgetCents: z.number().int().positive().optional(),
});

type Props = {
  campaignId: string;
  status: string | null;
  dailyBudgetCents: number | null;
  hasWriteAccess: boolean;
  accountLabel?: string | null;
};

function actionLabel(actionType: ActionType): string {
  if (actionType === "pause") return "Mettre en pause";
  if (actionType === "resume") return "Réactiver";
  return "Modifier le budget quotidien";
}

function statusLabel(status: string | null): string {
  if (status === "ACTIVE") return "Active";
  if (status === "PAUSED") return "En pause";
  if (status === "ARCHIVED") return "Archivée";
  return status ?? "inconnu";
}

export function MetaCampaignActions({ campaignId, status, dailyBudgetCents, hasWriteAccess, accountLabel }: Props) {
  const [budget, setBudget] = useState(dailyBudgetCents === null ? "" : String(Math.round(dailyBudgetCents / 100)));
  const storageKey = `scale-x-meta-action:${campaignId}`;
  const [proposal, setProposal] = useState<Proposal | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (!stored) return null;
      const parsed = storedProposalSchema.safeParse(JSON.parse(stored));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  });
  const [message, setMessage] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isPaused = status === "PAUSED";
  const isArchived = status === "ARCHIVED";
  const writeAccessHref = `/api/meta-ads/write-access?return_to=${encodeURIComponent(`/acquisition/ads/meta/${campaignId}`)}`;

  function propose(actionType: ActionType, value?: number) {
    setMessage(null);
    setDeepLink(null);
    if (isArchived && actionType === "resume") {
      setMessage("Cette campagne est archivée dans Meta Ads. Ouvre Meta pour décider de la suite.");
      return;
    }
    if (actionType === "set_daily_budget" && (!value || value < 1)) {
      setMessage("Renseigne un budget quotidien supérieur à 0 €.");
      return;
    }
    const nextProposal = { actionType, dailyBudgetCents: actionType === "set_daily_budget" && value ? Math.round(value * 100) : undefined };
    setProposal(nextProposal);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(nextProposal));
    } catch {
      // The proposal remains usable when browser storage is unavailable.
    }
  }

  function confirmProposal() {
    if (!proposal) return;
    if (!hasWriteAccess) {
      setMessage("Autorise ads_management pour continuer. La proposition est conservée sur cet appareil.");
      return;
    }
    if (proposal.actionType === "pause" && !window.confirm("Cette action va interrompre la diffusion de la campagne dans Meta Ads. Confirmer la mise en pause ?")) return;
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
        idempotencyKey: crypto.randomUUID(),
      });
      setDeepLink(result.deepLink ?? null);
      if (result.needsWriteAccess) {
        setMessage("Permission d’écriture requise. Aucune modification n’a été tentée.");
      } else if (result.error) {
        setMessage(result.error);
      } else {
        setMessage("Action vérifiée dans Meta Ads.");
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

  return (
    <div className="sticker-card p-6">
      <div>
        <p className="font-bold">Actions contrôlées</p>
        <p className="mt-1 text-sm text-muted-foreground">Chaque action suit proposition → confirmation → relecture de l’état dans Meta. Les changements de ciblage et de créatif restent dans Meta Ads.</p>
      </div>
      {!hasWriteAccess && (
        <div className="mt-4 flex flex-col gap-2 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-3 text-sm text-state-caution">
          <p className="font-bold">Permission d’écriture absente</p>
          <p>La lecture reste active. Autorise ads_management avant de confirmer une pause, une reprise ou un nouveau budget.</p>
          <MetaAdsConsentDialog
            mode="write"
            href={writeAccessHref}
            accountLabel={accountLabel ?? "compte publicitaire sélectionné"}
            triggerLabel="Autoriser les actions Meta"
            triggerVariant="accent2"
            triggerClassName="self-start"
          />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => propose(isPaused ? "resume" : "pause")} disabled={isPending || isArchived}>
          {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {isArchived ? "Campagne archivée" : isPaused ? "Proposer la reprise" : "Proposer la pause"}
        </Button>
        <div className="flex items-center gap-2">
          <label htmlFor="meta-daily-budget" className="sr-only">Budget quotidien en euros</label>
          <input
            id="meta-daily-budget"
            inputMode="decimal"
            type="number"
            min="1"
            step="1"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            className="h-9 w-28 rounded-[var(--radius-control)] border border-border bg-card px-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            placeholder="Budget / jour"
          />
          <Button variant="outline" onClick={() => propose("set_daily_budget", Number(budget))} disabled={isPending}>
            <Save className="size-4" />
            Proposer le budget
          </Button>
        </div>
      </div>
      {proposal && (
        <div className="mt-5 rounded-[var(--radius-control)] border border-accent-2/30 bg-accent-2/5 p-4" aria-labelledby="meta-action-proposal-title">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-accent-2" />
            <div className="min-w-0 flex-1">
              <p id="meta-action-proposal-title" className="font-bold">Proposition : {actionLabel(proposal.actionType)}</p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">État actuel</dt><dd className="font-bold">{statusLabel(status)}{dailyBudgetCents !== null ? ` · ${Math.round(dailyBudgetCents / 100)} €/jour` : ""}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Nouvelle valeur</dt><dd className="font-bold">{proposal.actionType === "pause" ? "PAUSED" : proposal.actionType === "resume" ? "ACTIVE" : `${Math.round((proposal.dailyBudgetCents ?? 0) / 100)} €/jour`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Variation budget</dt><dd className="font-bold">{proposal.actionType === "set_daily_budget" ? (variation === null ? "Base inconnue" : `${variation >= 0 ? "+" : ""}${variation.toFixed(0)} %`) : "—"}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">Scale X relira la valeur dans Meta juste avant l’écriture. Si elle a changé, l’action sera interrompue pour te laisser décider à nouveau.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {!hasWriteAccess ? (
                  <MetaAdsConsentDialog
                    mode="write"
                    href={writeAccessHref}
                    accountLabel={accountLabel ?? "compte publicitaire sélectionné"}
                    triggerLabel="Autoriser puis reprendre"
                    triggerVariant="accent2"
                  />
                ) : (
                  <Button variant="accent2" onClick={confirmProposal} disabled={isPending}>{isPending ? "Vérification…" : "Confirmer et appliquer"}</Button>
                )}
                <Button variant="outline" onClick={() => setProposal(null)} disabled={isPending}>Annuler</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {message && <p className="mt-3 text-sm font-bold text-muted-foreground" role="status">{message}</p>}
      {deepLink && (
        <a href={deepLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold underline-offset-4 hover:underline">
          Ouvrir dans Meta Ads <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}
