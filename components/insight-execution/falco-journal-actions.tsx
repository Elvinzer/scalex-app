"use client";

import { Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { updateInitiativeStatus } from "@/lib/insight-execution/actions";
import { INITIATIVE_STATUS_LABELS } from "@/lib/insight-execution/state";
import type { InsightHistoryItem } from "@/lib/insight-execution/types";

function snapshotText(item: InsightHistoryItem, key: "problem" | "successCriterion"): string | null {
  const value = item.snapshot[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function FalcoJournalActions({ items }: { items: InsightHistoryItem[] }) {
  const [localItems, setLocalItems] = useState(items);
  if (localItems.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="falco-journal-actions-title">
      <div>
        <p className="text-xs font-bold tracking-wide text-accent-2-text uppercase">Falco</p>
        <h2 id="falco-journal-actions-title" className="mt-1 text-lg font-bold">Actions issues de tes conversations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Retrouve le problème, l&apos;action exacte et le critère qui te permettra de vérifier.</p>
      </div>
      {localItems.map((item) => (
        <FalcoJournalAction
          key={item.id}
          item={item}
          onCompleted={() => {
            setLocalItems((current) => current.map((candidate) => candidate.id === item.id ? {
              ...candidate,
              decision: "completed",
              initiative: candidate.initiative ? { ...candidate.initiative, status: "completed" } : null,
            } : candidate));
          }}
        />
      ))}
    </section>
  );
}

function FalcoJournalAction({ item, onCompleted }: { item: InsightHistoryItem; onCompleted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const initiative = item.initiative;
  const problem = snapshotText(item, "problem");
  const criterion = snapshotText(item, "successCriterion");
  const isDone = item.decision === "completed" || initiative?.status === "completed";

  function complete() {
    if (!initiative || isPending || isDone) return;
    setError(null);
    startTransition(async () => {
      const result = await updateInitiativeStatus({ initiativeId: initiative.id, status: "completed" });
      if (result.error) {
        setError(result.error);
        return;
      }
      onCompleted();
    });
  }

  return (
    <article className="sticker-card p-5" data-testid="falco-journal-action">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wide text-accent-2-text uppercase">{item.sourceLabel ?? "Falco"}</p>
          <h3 className="mt-1 text-base font-bold break-words">{item.title}</h3>
        </div>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold">
          {initiative ? INITIATIVE_STATUS_LABELS[initiative.status] : item.decision === "launched" ? "Lancé" : "À traiter"}
        </span>
      </div>

      {initiative?.isWeeklyFocus && (
        <p className="mt-3 inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-text">Priorité de la semaine</p>
      )}
      <div className="mt-4 flex flex-col gap-3 text-sm leading-6">
        {problem && <p><span className="font-bold">Le problème : </span>{problem}</p>}
        <p className="whitespace-pre-wrap break-words"><span className="font-bold">L&apos;action : </span>{item.insightText}</p>
        {criterion && <p className="whitespace-pre-wrap break-words"><span className="font-bold">Critère de réussite : </span>{criterion}</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-muted-foreground">
        {initiative?.dueDate && <span>Échéance {new Date(`${initiative.dueDate}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}</span>}
          <Link href={`/copilote?conversation=${encodeURIComponent(item.sourceId)}`} className="inline-flex min-h-11 items-center text-accent-2-text underline-offset-2 hover:underline">
          Voir la conversation
        </Link>
        {!isDone && initiative && (
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={complete} disabled={isPending}>
            <Check className="size-3.5" aria-hidden="true" />
            {isPending ? "Enregistrement..." : "Marquer terminée"}
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-state-critical" role="alert">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          {error}
        </p>
      )}
    </article>
  );
}
