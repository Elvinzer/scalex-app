"use client";

import { Check, CircleAlert, MessageCircle, Pencil, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  captureCopiloteInsight,
  decideInsight,
  updateCopiloteInsight,
  updateInitiativeStatus,
} from "@/lib/insight-execution/actions";
import type { InsightHistoryItem, InitiativeStatus } from "@/lib/insight-execution/types";
import { clearInsightDraft, readInsightDraft, writeInsightDraft, type InsightDraft as Draft } from "@/lib/insight-execution/draft-storage";
import type { FalcoInsightEvent, FalcoInsightProposal } from "@/lib/agent/falco-insight-proposal";

import { InsightLaunchDialog } from "./insight-launch-dialog";

const STATUS_LABELS: Record<InsightHistoryItem["decision"], string> = {
  todo: "À traiter",
  launched: "Lancé",
  later: "À reprendre",
  dismissed: "Écartée",
  completed: "Terminée",
};

type InsightCardState = "proposal" | "editing" | "saving" | "saved" | "launched" | "completed" | "vague" | "error" | "duplicate";

function snapshotText(insight: InsightHistoryItem, key: "problem" | "successCriterion"): string {
  const value = insight.snapshot[key];
  return typeof value === "string" ? value : key === "problem" ? "Problème identifié dans la conversation." : "Critère à préciser dans le suivi.";
}

function draftFromInsight(insight: InsightHistoryItem): Draft {
  return {
    title: insight.title,
    problem: snapshotText(insight, "problem"),
    actionText: insight.insightText,
    successCriterion: snapshotText(insight, "successCriterion"),
  };
}

function draftFromProposal(proposal: FalcoInsightProposal | null): Draft {
  return {
    title: proposal?.title ?? "",
    problem: proposal?.problem ?? "",
    actionText: proposal?.actionText ?? "",
    successCriterion: proposal?.successCriterion ?? "",
  };
}

function statusClass(decision: InsightHistoryItem["decision"]): string {
  if (decision === "completed") return "border-positive/35 bg-positive/10 text-positive";
  if (decision === "launched") return "border-accent/35 bg-accent/10 text-accent-text";
  if (decision === "dismissed") return "border-state-critical/35 bg-state-critical/10 text-state-critical";
  return "border-accent-2-border bg-accent-2-soft text-accent-2-text";
}

export function InsightStatusBadge({ decision }: { decision: InsightHistoryItem["decision"] }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(decision)}`}>
      {STATUS_LABELS[decision]}
    </span>
  );
}

export function InsightSourceLine({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
      <MessageCircle className="size-3.5" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

export function VagueActionPrompt({
  event,
  onQuickReply,
}: {
  event: Extract<FalcoInsightEvent, { kind: "vague" }>;
  onQuickReply?: (value: string) => void;
}) {
  return (
    <div className="sticker-card-dashed w-full p-4" data-state="vague" data-testid="falco-vague-action">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-accent-2-text" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-bold">Pas encore d&apos;action à retenir</p>
          <p className="mt-1 text-sm text-muted-foreground">{event.missing}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {event.quickReplies.map((reply) => (
              <Button key={reply} type="button" size="sm" className="min-h-11" variant="outline" onClick={() => onQuickReply?.(reply)}>
                {reply}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExistingActionBanner({
  conversationId,
  onOpen,
}: {
  conversationId: string;
  onOpen?: () => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-accent-2-border bg-accent-2-soft p-4" role="status">
      <p className="text-sm font-bold">Cette conversation a déjà une action associée.</p>
      <Link
        href={`/copilote?conversation=${encodeURIComponent(conversationId)}`}
        onClick={onOpen}
        className="inline-flex min-h-11 shrink-0 items-center text-xs font-bold text-accent-2-text underline-offset-2 hover:underline"
      >
        Voir l&apos;action
      </Link>
    </div>
  );
}

export function InsightActionCard({
  conversationId,
  sourceLabel,
  event,
  duplicateInsight = false,
  insight,
  onInsightChange,
  onContinue,
  onQuickReply,
}: {
  conversationId: string;
  sourceLabel: string;
  event?: FalcoInsightEvent | null;
  duplicateInsight?: boolean;
  insight?: InsightHistoryItem | null;
  onInsightChange?: (insight: InsightHistoryItem) => void;
  onContinue?: () => void;
  onQuickReply?: (value: string) => void;
}) {
  const proposal = event?.kind === "proposal" ? event : null;
  const [mode, setMode] = useState<"proposal" | "editing">("proposal");
  const [draft, setDraft] = useState<Draft>(() => draftFromProposal(proposal));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (insight) {
      setDraft(draftFromInsight(insight));
      return;
    }
    const restored = readInsightDraft(typeof window === "undefined" ? null : window.sessionStorage, conversationId);
    if (restored) {
      setDraft(restored);
      setMode("editing");
    } else if (proposal) {
      setDraft(draftFromProposal(proposal));
    }
  }, [conversationId, insight, proposal]);

  useEffect(() => {
    if (mode === "editing" && !insight) writeInsightDraft(typeof window === "undefined" ? null : window.sessionStorage, conversationId, draft);
  }, [conversationId, draft, insight, mode]);

  const canEdit = !insight || ["todo", "later", "dismissed"].includes(insight.decision);
  const initiative = insight?.initiative ?? null;
  const isLaunched = insight?.decision === "launched" && initiative !== null;
  const isCompleted = insight?.decision === "completed" || initiative?.status === "completed";

  const missingFields = useMemo(
    () => [draft.title, draft.problem, draft.actionText, draft.successCriterion].some((value) => value.trim().length === 0),
    [draft],
  );

  function updateField(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function cancelEditing() {
    clearInsightDraft(typeof window === "undefined" ? null : window.sessionStorage, conversationId);
    setDraft(insight ? draftFromInsight(insight) : draftFromProposal(proposal));
    setMode("proposal");
    setError(null);
  }

  function save() {
    if (missingFields || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = insight
        ? await updateCopiloteInsight({ conversationId, ...draft })
        : await captureCopiloteInsight({ conversationId, ...draft });
      if (result.error || !result.insight) {
        setError(result.error ?? "L'action n'a pas pu être enregistrée.");
        return;
      }
      clearInsightDraft(typeof window === "undefined" ? null : window.sessionStorage, conversationId);
      setMode("proposal");
      onInsightChange?.(result.insight);
    });
  }

  function decide(decision: "later" | "dismissed" | "todo") {
    if (!insight || isPending) return;
    startTransition(async () => {
      const result = await decideInsight({ insightId: insight.id, decision });
      if (result.error) {
        setError(result.error);
        return;
      }
      onInsightChange?.({ ...insight, decision, resumeAt: decision === "later" ? insight.resumeAt : null });
    });
  }

  function complete() {
    if (!initiative || isPending) return;
    startTransition(async () => {
      const result = await updateInitiativeStatus({ initiativeId: initiative.id, status: "completed" });
      if (result.error) {
        setError(result.error);
        return;
      }
      onInsightChange?.({
        ...insight!,
        decision: "completed",
        initiative: { ...initiative, status: "completed" as InitiativeStatus },
      });
    });
  }

  if (event?.kind === "vague" && !insight) {
    return <VagueActionPrompt event={event} onQuickReply={onQuickReply} />;
  }

  if (!proposal && !insight) return null;

  const display = insight ? draftFromInsight(insight) : draft;
  const source = insight?.sourceLabel ?? sourceLabel;
  const cardState: InsightCardState = error
    ? "error"
    : isPending
      ? "saving"
      : duplicateInsight && insight
        ? "duplicate"
        : insight
          ? isCompleted
            ? "completed"
            : isLaunched
              ? "launched"
              : "saved"
          : mode === "editing"
            ? "editing"
            : "proposal";
  const cardLabel = duplicateInsight
    ? `Action déjà associée — ${display.title}`
    : insight
      ? `${STATUS_LABELS[insight.decision]} — ${display.title}`
      : `Action à retenir — ${display.title}`;

  return (
    <section
      className="w-full rounded-[var(--radius-card)] border-2 border-accent-2-border bg-background p-4 shadow-[var(--shadow-card)]"
      aria-label={cardLabel}
      aria-live="polite"
      data-state={cardState}
      data-testid="falco-insight-card"
    >
      <span className="sr-only" role="status">
        {isPending ? "Enregistrement de l’insight en cours." : ""}
      </span>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-accent-2-text">{insight ? "Insight conservé" : "Action à retenir"}</p>
          <InsightSourceLine label={source} />
        </div>
        {insight && <InsightStatusBadge decision={insight.decision} />}
      </div>

      {duplicateInsight && insight && <div className="mt-4"><ExistingActionBanner conversationId={conversationId} /></div>}

      {mode === "editing" && canEdit ? (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Titre de l&apos;action
            <input value={draft.title} onChange={(event) => updateField("title", event.target.value)} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" maxLength={120} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            L&apos;action à implémenter
            <textarea value={draft.actionText} onChange={(event) => updateField("actionText", event.target.value)} rows={5} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" maxLength={2000} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Critère de réussite
            <textarea value={draft.successCriterion} onChange={(event) => updateField("successCriterion", event.target.value)} rows={3} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" maxLength={1000} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={save} disabled={isPending || missingFields}>
              {isPending ? "Enregistrement..." : "Enregistrer l’insight"}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={cancelEditing} disabled={isPending}>
              Annuler
            </Button>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-critical/35 bg-state-critical/10 p-3 text-sm text-state-critical" role="alert">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error} Ton texte est conservé. Réessaie.</span>
              <Button type="button" size="sm" variant="outline" onClick={save} disabled={isPending} className="ml-auto min-h-11 shrink-0">
                Réessayer
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Le problème</p>
            <p className="mt-1 text-sm leading-6">{display.problem}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">L&apos;action</p>
            <p className="mt-1 text-sm leading-6 whitespace-pre-wrap break-words">{display.actionText}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Critère de réussite</p>
            <p className="mt-1 text-sm leading-6 whitespace-pre-wrap break-words">{display.successCriterion}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-critical/35 bg-state-critical/10 p-3 text-sm text-state-critical" role="alert">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error} Ton texte est conservé. Réessaie.</span>
              <Button type="button" size="sm" variant="outline" onClick={save} disabled={isPending} className="ml-auto shrink-0">
                Réessayer
              </Button>
            </div>
          )}

          {!insight && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="min-h-11" onClick={() => setMode("editing")} disabled={isPending}>
                Garder cette action
              </Button>
              <Button type="button" variant="ghost" className="min-h-11" onClick={onContinue}>
                Continuer à creuser
              </Button>
            </div>
          )}

          {insight && !isLaunched && !isCompleted && (
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setMode("editing")} disabled={isPending}>
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Modifier
                </Button>
              )}
              <InsightLaunchDialog
                insight={insight}
                members={[]}
                projects={[]}
                canAssign={false}
                triggerLabel="Lancer dans le Journal"
                triggerPrimary
                onLaunched={onInsightChange}
              />
              {insight.decision !== "dismissed" ? (
                <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => decide(insight.decision === "later" ? "todo" : "later")} disabled={isPending}>
                  {insight.decision === "later" ? "Réactiver" : "Plus tard"}
                </Button>
              ) : (
                <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => decide("todo")} disabled={isPending}>
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Réactiver
                </Button>
              )}
              {insight.decision !== "dismissed" && (
                <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => decide("dismissed")} disabled={isPending}>
                  Écarter
                </Button>
              )}
            </div>
          )}

          {isLaunched && !isCompleted && (
            <div className="flex flex-wrap gap-2">
              <Link href="/journal" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:bg-muted">
                Ouvrir dans le Journal
              </Link>
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={complete} disabled={isPending}>
                <Check className="size-3.5" aria-hidden="true" />
                Marquer terminée
              </Button>
            </div>
          )}

          {isCompleted && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/copilote?conversation=${encodeURIComponent(conversationId)}`} className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:bg-muted">
                Voir la conversation
              </Link>
              <Link href="/journal" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:bg-muted">
                Ouvrir dans le Journal
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
