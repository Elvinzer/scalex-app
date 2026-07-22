"use client";

import { useEffect, useState } from "react";

import { Falco } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { Button } from "@/components/ui/button";
import type { AnalyzeSheetResult } from "@/lib/import/schema";

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

const AD_CAMPAIGNS_CONFIRM_MARKER = "__ad_campaigns_confirm__";

type ColumnQuestion = { kind: "column"; sheetIndex: number; sourceColumn: string; prompt: string; options: string[] };
type PeriodQuestion = { kind: "period"; sheetIndex: number };
type HeaderQuestion = { kind: "header"; sheetIndex: number; sheetName: string; previewRows: string[][] };
type AdsConfirmQuestion = { kind: "ads_confirm"; sheetIndex: number; sheetName: string };
type PendingQuestion = ColumnQuestion | PeriodQuestion | HeaderQuestion | AdsConfirmQuestion;

const MAX_QUESTIONS = 6;

function buildQuestionQueue(sheets: AnalyzeSheetResult[]): PendingQuestion[] {
  const queue: PendingQuestion[] = [];
  sheets.forEach((sheet, sheetIndex) => {
    if (!sheet.headerRowConfident) {
      queue.push({ kind: "header", sheetIndex, sheetName: sheet.sheetName, previewRows: sheet.previewRows });
    }
    for (const question of sheet.mapping.questions) {
      if (question.sourceColumn === AD_CAMPAIGNS_CONFIRM_MARKER) {
        queue.push({ kind: "ads_confirm", sheetIndex, sheetName: sheet.sheetName });
      } else {
        queue.push({ kind: "column", sheetIndex, sourceColumn: question.sourceColumn, prompt: question.prompt, options: question.options });
      }
    }
    if (sheet.mapping.targetTable !== "ignore" && sheet.mapping.dateColumnName === null && sheet.mapping.periodDetected === null) {
      queue.push({ kind: "period", sheetIndex });
    }
  });
  return queue.slice(0, MAX_QUESTIONS);
}

// Falco asks one question at a time, same pattern as
// app/(app)/diagnostic/discovery-conversation.tsx — no generic
// "conversational engine" exists in this codebase, every flow hand-rolls
// its own, so this stays consistent with that.
export function ImportClarify({
  sheets: initialSheets,
  onResolved,
  onHeaderRowChosen,
}: {
  sheets: AnalyzeSheetResult[];
  onResolved: (sheets: AnalyzeSheetResult[]) => void;
  // Bubbles up to ImportFlow, which owns the original File objects — a
  // header-row answer requires re-uploading and re-analyzing the sheet
  // (the client only has 3 preview rows, not the full raw grid needed to
  // re-slice headers/values itself).
  onHeaderRowChosen: (sheetName: string, rowIndex: number) => void;
}) {
  const [sheets, setSheets] = useState(initialSheets);
  const [queue] = useState(() => buildQuestionQueue(initialSheets));
  const [index, setIndex] = useState(0);
  const [periodDraft, setPeriodDraft] = useState({ year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() + 1 });

  useEffect(() => {
    if (queue.length === 0) onResolved(sheets);
    // Only run once on mount when there's nothing to ask — subsequent
    // resolution happens through handleAnswer instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (queue.length === 0) return null;

  const current = queue[index];
  if (!current) return null;

  function advance(updatedSheets: AnalyzeSheetResult[]) {
    setSheets(updatedSheets);
    if (index + 1 >= queue.length) {
      onResolved(updatedSheets);
      return;
    }
    setIndex(index + 1);
  }

  function handleColumnAnswer(question: ColumnQuestion, choice: string | null) {
    const updated = sheets.map((sheet, sheetIndex) => {
      if (sheetIndex !== question.sheetIndex) return sheet;
      // The column already has a mappings[] entry (with its full
      // columnValues) from the initial analyze response — Falco's question
      // just resolves what targetField it should have, never a new entry.
      return {
        ...sheet,
        mapping: {
          ...sheet.mapping,
          mappings: sheet.mapping.mappings.map((entry) =>
            entry.sourceColumn === question.sourceColumn ? { ...entry, targetField: choice, confidence: "high" as const } : entry
          ),
        },
      };
    });
    advance(updated);
  }

  function handlePeriodAnswer(question: PeriodQuestion) {
    const updated = sheets.map((sheet, sheetIndex) =>
      sheetIndex !== question.sheetIndex ? sheet : { ...sheet, mapping: { ...sheet.mapping, periodDetected: periodDraft } }
    );
    advance(updated);
  }

  function handleAdsConfirmAnswer(question: AdsConfirmQuestion, keep: boolean) {
    const updated = sheets.map((sheet, sheetIndex) => {
      if (sheetIndex !== question.sheetIndex) return sheet;
      const mapping = keep
        ? { ...sheet.mapping, questions: sheet.mapping.questions.filter((q) => q.sourceColumn !== AD_CAMPAIGNS_CONFIRM_MARKER) }
        : { ...sheet.mapping, targetTable: "ignore" as const, ignoreReason: "Ignorée par choix de l'utilisateur.", mappings: [] };
      return { ...sheet, mapping };
    });
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
            : current.kind === "header"
              ? `C'est laquelle, ta ligne de titres, sur "${current.sheetName}" ?`
              : current.kind === "ads_confirm"
                ? `Ta feuille "${current.sheetName}" ressemble à du tracking de pub. Je l'importe dans ton module Ads, ou je l'ignore ?`
                : current.prompt}
        </FalcoBubble>
      </div>

      {current.kind === "header" ? (
        <div className="flex flex-col gap-2">
          <div className="sticker-card overflow-x-auto p-3 text-xs">
            <table className="w-full border-collapse">
              <tbody>
                {current.previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border last:border-b-0">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-2 py-1 whitespace-nowrap">
                        {cell || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            {current.previewRows.map((_, rowIndex) => (
              <Button key={rowIndex} variant="secondary" onClick={() => onHeaderRowChosen(current.sheetName, rowIndex)}>
                Ligne {rowIndex + 1}
              </Button>
            ))}
          </div>
        </div>
      ) : current.kind === "ads_confirm" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => handleAdsConfirmAnswer(current, true)}>
            Importer dans Ads
          </Button>
          <Button variant="ghost" onClick={() => handleAdsConfirmAnswer(current, false)}>
            Ignorer cette feuille
          </Button>
        </div>
      ) : current.kind === "period" ? (
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
