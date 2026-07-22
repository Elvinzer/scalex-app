"use client";

import { useMemo, useState } from "react";

import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import { aggregateColumnValues } from "@/lib/import/aggregate";
import type { AnalyzeFileResult, CommitImportPayload } from "@/lib/import/schema";
import { cn } from "@/lib/utils";

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

const CONFIDENCE_CLASS: Record<string, string> = {
  high: "bg-state-healthy-bg text-state-healthy",
  medium: "bg-state-caution-bg text-state-caution",
  low: "bg-muted text-muted-foreground",
};

type ResolvedField = {
  fileIndex: number;
  targetField: string;
  value: number;
  sourceLabel: string;
  confidence: "high" | "medium" | "low";
  year: number;
  month: number;
};

function buildResolvedFields(files: AnalyzeFileResult[]): ResolvedField[] {
  const resolved: ResolvedField[] = [];
  files.forEach((file, fileIndex) => {
    const period = file.mapping.periodDetected;
    if (!period) return;
    for (const entry of file.mapping.mappings) {
      if (!entry.targetField) continue;
      resolved.push({
        fileIndex,
        targetField: entry.targetField,
        value: aggregateColumnValues(entry.columnValues, entry.granularity),
        sourceLabel: `colonne "${entry.sourceColumn}"${file.mapping.targetTable === "monthly_metrics" ? `, ${entry.granularity === "monthly" ? "valeur du mois" : `${entry.granularity} × ${entry.columnValues.length}`}` : ""}`,
        confidence: entry.confidence,
        year: period.year,
        month: period.month,
      });
    }
  });
  return resolved;
}

export function ImportPreview({
  files,
  existingMonths,
  tokens,
  keySource,
  onCommit,
  onExtracted,
  onCancel,
  isCommitting,
}: {
  files: AnalyzeFileResult[];
  existingMonths: Record<string, Record<string, unknown> | null>;
  tokens: { inputTokens: number; outputTokens: number };
  keySource: "byok" | "shared";
  onCommit?: (payload: CommitImportPayload) => void;
  // Onboarding uses this instead of onCommit: no monthly_metrics row exists
  // yet on a brand new account, so there's nothing to write or conflict
  // with here — just hand the resolved values back so the existing
  // step-2 form (saveOnboardingMonth) commits them, same as manual entry.
  onExtracted?: (values: Record<string, number>, year: number, month: number) => void;
  onCancel: () => void;
  isCommitting: boolean;
}) {
  const resolvedFields = useMemo(() => buildResolvedFields(files), [files]);
  const unmappedColumns = files.flatMap((f) => f.mapping.unmappedColumns);
  const [conflictChoices, setConflictChoices] = useState<Record<string, "keep" | "replace">>({});

  const byMonth = useMemo(() => {
    const map = new Map<string, ResolvedField[]>();
    for (const field of resolvedFields) {
      const key = `${field.year}-${field.month}`;
      map.set(key, [...(map.get(key) ?? []), field]);
    }
    return map;
  }, [resolvedFields]);

  if (resolvedFields.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Falco pose="sleeping" size="md" animate="enter" />
        <p className="text-sm text-muted-foreground">
          Aucune valeur exploitable détectée. Vérifie le mois ciblé ou saisis tes chiffres à la main.
        </p>
        <Button variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    );
  }

  function handleCommit() {
    if (onExtracted) {
      const first = [...byMonth.values()][0] ?? [];
      onExtracted(Object.fromEntries(first.map((f) => [f.targetField, f.value])), first[0]?.year, first[0]?.month);
      return;
    }

    const targetTable = files[0]?.mapping.targetTable ?? "monthly_metrics";
    const months: CommitImportPayload["months"] = [...byMonth.entries()].map(([, fields]) => ({
      year: fields[0].year,
      month: fields[0].month,
      values: Object.fromEntries(fields.map((f) => [f.targetField, f.value])),
      conflictChoices,
    }));

    onCommit?.({
      targetTable,
      fileHash: files[0]?.fileHash ?? "",
      keySource,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      months,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-bold">Vérifie avant d&apos;importer</p>

      {[...byMonth.entries()].map(([monthKey, fields]) => {
        const existing = existingMonths[monthKey];
        return (
          <div key={monthKey} className="sticker-card flex flex-col gap-2 p-4">
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {fields[0].month}/{fields[0].year}
            </p>
            {fields.map((field) => {
              const existingValue = existing ? (existing as Record<string, unknown>)[field.targetField] : null;
              const hasConflict = existingValue !== null && existingValue !== undefined;
              return (
                <div key={field.targetField} className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0">
                  <div>
                    <p className="text-sm font-bold">{FIELD_LABELS[field.targetField] ?? field.targetField}</p>
                    <p className="text-xs text-muted-foreground">{field.sourceLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", CONFIDENCE_CLASS[field.confidence])}>
                      {field.confidence}
                    </span>
                    {hasConflict ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground line-through">{String(existingValue)}</span>
                        <span>→</span>
                        <span className="font-bold tabular-nums">{field.value}</span>
                        <select
                          value={conflictChoices[field.targetField] ?? "replace"}
                          onChange={(event) =>
                            setConflictChoices((prev) => ({ ...prev, [field.targetField]: event.target.value as "keep" | "replace" }))
                          }
                          className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-xs outline-none"
                        >
                          <option value="replace">Remplacer</option>
                          <option value="keep">Garder l&apos;actuel</option>
                        </select>
                      </div>
                    ) : (
                      <span className="font-bold tabular-nums">{field.value}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {unmappedColumns.length > 0 && (
        <p className="text-xs text-muted-foreground">Ignorées : {unmappedColumns.map((c) => `"${c}"`).join(", ")}</p>
      )}

      <div className="flex gap-2">
        <Button onClick={handleCommit} disabled={isCommitting}>
          {isCommitting ? "Import en cours..." : onExtracted ? "C'est bon ?" : `Importer ${resolvedFields.length} valeur${resolvedFields.length > 1 ? "s" : ""}`}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isCommitting}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
