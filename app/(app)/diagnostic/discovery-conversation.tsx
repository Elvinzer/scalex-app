"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Falco } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { Button } from "@/components/ui/button";
import type { LeverCatalogEntry, LeverQuestion } from "@/lib/levers/catalog";
import { cn } from "@/lib/utils";

import { saveLeverAnswer } from "./discovery-actions";

const CATEGORY_LABEL: Record<LeverCatalogEntry["category"], string> = {
  acquisition: "Acquisition",
  vente: "Vente",
  delivrabilite: "Délivrabilité",
};

function StatField({ question, value, onChange }: { question: LeverQuestion; value: string; onChange: (v: string) => void }) {
  const fieldClass =
    "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold">
        {question.prompt}
        {question.unit && <span className="ml-1 font-normal text-muted-foreground">({question.unit})</span>}
      </span>
      {question.kind === "select" ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass}>
          <option value="">Choisir...</option>
          {question.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={question.kind === "stat_number" ? "number" : "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClass}
        />
      )}
    </label>
  );
}

// Same conversational feel as app/onboarding/onboarding-flow.tsx (Falco
// bubbles, inline answers) but scoped to one lever at a time, grouped by
// category, and — unlike onboarding — persisted after every single answer
// (saveLeverAnswer) so the parcours is genuinely interruptible: closing the
// tab mid-way and coming back resumes exactly here, no local-only state.
export function DiscoveryConversation({
  levers: leversProp,
  initialTotal,
  initialAnswered,
}: {
  levers: LeverCatalogEntry[]; // only the levers still needing a question, in order
  initialTotal: number;
  initialAnswered: number;
}) {
  const router = useRouter();
  // Snapshotted once on mount, deliberately ignoring subsequent `levers`
  // prop updates: saveLeverAnswer calls revalidatePath("/diagnostic") after
  // EVERY answer (not just the last), which re-renders the server parent
  // and hands this component a shorter `levers` array mid-conversation. If
  // `index` were applied to that live prop instead of a frozen snapshot,
  // the array shift landing at the same time as the local index++ could
  // skip straight past the next question. The snapshot keeps this
  // component's own walk through the list stable regardless of when the
  // server-side revalidation lands.
  const [levers] = useState(leversProp);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"primary" | "stats">("primary");
  const [statDraft, setStatDraft] = useState<Record<string, string>>({});
  const [answeredCount, setAnsweredCount] = useState(initialAnswered);
  const [isPending, setIsPending] = useState(false);

  const lever = levers[index];
  const primaryQuestion = lever?.questions[0];
  const statQuestions = lever?.questions.slice(1) ?? [];

  async function advance(status: "active" | "absent", stats: Record<string, string>) {
    if (!lever) return;
    setIsPending(true);
    const numericStats: Record<string, number | string> = {};
    for (const [key, raw] of Object.entries(stats)) {
      const num = Number(raw);
      numericStats[key] = raw.trim() !== "" && !Number.isNaN(num) ? num : raw;
    }
    await saveLeverAnswer(lever.leverKey, status, numericStats);
    setIsPending(false);

    const nextAnswered = answeredCount + 1;
    setAnsweredCount(nextAnswered);
    setStatDraft({});
    setPhase("primary");

    if (index + 1 >= levers.length) {
      router.refresh(); // last lever answered — parent swaps to the results view
      return;
    }
    setIndex(index + 1);
  }

  function handlePrimaryAnswer(answer: "yes" | "no" | "not_yet") {
    if (answer === "yes" && statQuestions.length > 0) {
      setPhase("stats");
      return;
    }
    void advance(answer === "yes" ? "active" : "absent", {});
  }

  function handleStatsSubmit(event: React.FormEvent) {
    event.preventDefault();
    void advance("active", statDraft);
  }

  if (!lever) return null;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-8">
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(answeredCount / initialTotal) * 100}%` }} />
        </div>
        <span className="text-xs font-bold text-muted-foreground tabular-nums">
          {answeredCount}/{initialTotal}
        </span>
      </div>

      <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{CATEGORY_LABEL[lever.category]}</p>

      <div className="flex items-start gap-3">
        <Falco pose="thinking" size="md" animate="enter" />
        <FalcoBubble arrow="left" className="max-w-none flex-1">
          {phase === "primary" ? primaryQuestion?.prompt : "Top. Un à-peu-près suffit sur les chiffres qui suivent."}
        </FalcoBubble>
      </div>

      {phase === "primary" ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => handlePrimaryAnswer("yes")} disabled={isPending}>
            Oui
          </Button>
          <Button variant="secondary" onClick={() => handlePrimaryAnswer("no")} disabled={isPending}>
            Non
          </Button>
          <Button variant="ghost" onClick={() => handlePrimaryAnswer("not_yet")} disabled={isPending}>
            Pas encore
          </Button>
        </div>
      ) : (
        <form onSubmit={handleStatsSubmit} className="flex flex-col gap-4">
          {statQuestions.map((question) => (
            <StatField
              key={question.key}
              question={question}
              value={statDraft[question.key] ?? ""}
              onChange={(v) => setStatDraft((prev) => ({ ...prev, [question.key]: v }))}
            />
          ))}
          <Button type="submit" disabled={isPending} className={cn("self-start", isPending && "opacity-70")}>
            {isPending ? "..." : "Continuer →"}
          </Button>
        </form>
      )}
    </div>
  );
}
