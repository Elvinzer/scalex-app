"use client";

import { useEffect, useState } from "react";

import { Falco } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { Button } from "@/components/ui/button";
import type { AnalyzeFileResult } from "@/lib/import/schema";

const FIELD_LABELS: Record<string, string> = {
  cashCollected: "CA encaissé",
  cashContracted: "CA contracté",
  newFollowers: "Nouveaux abonnés",
  firstMessages: "Premiers messages",
  conversations: "Conversations démarrées",
  callsProposed: "Appels proposés",
  callsBooked: "Appels réservés",
  callsTaken: "Appels pris",
  salesClosed: "Ventes conclues",
};

type ColumnQuestion = {
  kind: "column";
  fileIndex: number;
  sourceColumn: string;
  prompt: string;
  options: string[];
};
type PeriodQuestion = { kind: "period"; fileIndex: number };
type PendingQuestion = ColumnQuestion | PeriodQuestion;

const MAX_QUESTIONS = 6;

function buildQuestionQueue(files: AnalyzeFileResult[]): PendingQuestion[] {
  const queue: PendingQuestion[] = [];
  files.forEach((file, fileIndex) => {
    if (file.mapping.periodDetected === null) {
      queue.push({ kind: "period", fileIndex });
    }
    for (const question of file.mapping.questions) {
      queue.push({ kind: "column", fileIndex, sourceColumn: question.sourceColumn, prompt: question.prompt, options: question.options });
    }
  });
  return queue.slice(0, MAX_QUESTIONS);
}

// Falco asks one question at a time, same pattern as
// app/(app)/diagnostic/discovery-conversation.tsx — no generic
// "conversational engine" exists in this codebase, every flow hand-rolls
// its own, so this stays consistent with that.
export function ImportClarify({
  files: initialFiles,
  onResolved,
}: {
  files: AnalyzeFileResult[];
  onResolved: (files: AnalyzeFileResult[]) => void;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [queue] = useState(() => buildQuestionQueue(initialFiles));
  const [index, setIndex] = useState(0);
  const [periodDraft, setPeriodDraft] = useState({ year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() + 1 });

  useEffect(() => {
    if (queue.length === 0) onResolved(files);
    // Only run once on mount when there's nothing to ask — subsequent
    // resolution happens through handleAnswer instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (queue.length === 0) return null;

  const current = queue[index];
  if (!current) return null;

  function advance(updatedFiles: AnalyzeFileResult[]) {
    setFiles(updatedFiles);
    if (index + 1 >= queue.length) {
      onResolved(updatedFiles);
      return;
    }
    setIndex(index + 1);
  }

  function handleColumnAnswer(question: ColumnQuestion, choice: string | null) {
    const updated = files.map((file, fileIndex) => {
      if (fileIndex !== question.fileIndex) return file;
      // The column already has a mappings[] entry (with its full
      // columnValues) from the initial analyze response — Falco's question
      // just resolves what targetField it should have, never a new entry.
      return {
        ...file,
        mapping: {
          ...file.mapping,
          mappings: file.mapping.mappings.map((entry) =>
            entry.sourceColumn === question.sourceColumn ? { ...entry, targetField: choice, confidence: "high" as const } : entry
          ),
        },
      };
    });
    advance(updated);
  }

  function handlePeriodAnswer(question: PeriodQuestion) {
    const updated = files.map((file, fileIndex) =>
      fileIndex !== question.fileIndex ? file : { ...file, mapping: { ...file.mapping, periodDetected: periodDraft } }
    );
    advance(updated);
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((index + 1) / queue.length) * 100}%` }} />
        </div>
        <span className="text-xs font-bold text-muted-foreground tabular-nums">
          {index + 1}/{queue.length}
        </span>
      </div>

      <div className="flex items-start gap-3">
        <Falco pose="thinking" size="md" animate="enter" />
        <FalcoBubble arrow="left" className="max-w-none flex-1">
          {current.kind === "period"
            ? "Ces chiffres, c'est quel mois ?"
            : current.prompt}
        </FalcoBubble>
      </div>

      {current.kind === "period" ? (
        <div className="flex items-center gap-2">
          <select
            value={periodDraft.month}
            onChange={(event) => setPeriodDraft((prev) => ({ ...prev, month: Number(event.target.value) }))}
            className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={periodDraft.year}
            onChange={(event) => setPeriodDraft((prev) => ({ ...prev, year: Number(event.target.value) }))}
            className="w-24 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"
          />
          <Button size="sm" onClick={() => handlePeriodAnswer(current)}>
            Continuer →
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {current.options.map((option) => (
            <Button key={option} variant="secondary" onClick={() => handleColumnAnswer(current, option)}>
              {FIELD_LABELS[option] ?? option}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => handleColumnAnswer(current, null)}>
            Ignorer cette colonne
          </Button>
        </div>
      )}
    </div>
  );
}
