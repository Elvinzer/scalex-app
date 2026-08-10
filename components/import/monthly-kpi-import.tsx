"use client";

import { useState } from "react";
import { z } from "zod";

import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";

import { ImportDropzone } from "./import-dropzone";

type MonthlyMetricKey = keyof MonthlyMetricsInput;
type ImportPeriod = { year: number; month: number };

type MappedField = {
  key: MonthlyMetricKey;
  label: string;
  value: string;
  source: string;
  confidence: "high" | "medium" | "low";
  uncertaintyId?: string;
};

type UncertainMatch = {
  id: string;
  sourceColumn: string;
  source: string;
  prompt: string;
  options: MonthlyMetricKey[];
  sampleValues: string[];
  candidateValue: string | null;
  linkedFieldKey: MonthlyMetricKey | null;
  status: "pending" | "resolved" | "ignored";
};

export type MonthlyKpiImportUsage = {
  fileHashes: string[];
  keySource: "byok" | "shared";
  inputTokens: number;
  outputTokens: number;
  fieldsCount: number;
};

const FIELD_LABELS: Record<MonthlyMetricKey, string> = {
  cashCollected: "CA collecté (€)",
  cashContracted: "CA contracté (€)",
  newFollowers: "Nouveaux abonnés",
  firstMessages: "Premiers messages envoyés",
  conversations: "Conversations démarrées",
  callsProposed: "Appels proposés",
  callsBooked: "Appels réservés",
  callsTaken: "Appels pris",
  salesClosed: "Ventes conclues",
};

const MONTHLY_KEYS = new Set<string>(Object.keys(FIELD_LABELS));

const analyzeResponseSchema = z.object({
  sheets: z.array(
    z.object({
      fileName: z.string(),
      sheetName: z.string(),
      fileHash: z.string(),
      headerRowConfident: z.boolean(),
      previewRows: z.array(z.array(z.string())),
      mapping: z.object({
        targetTable: z.enum(["monthly_metrics", "sales", "ignore"]),
        ignoreReason: z.string().nullable(),
        mappings: z.array(
          z.object({
            sourceColumn: z.string(),
            targetField: z.string().nullable(),
            confidence: z.enum(["high", "medium", "low"]),
            granularity: z.enum(["daily", "weekly", "monthly"]),
            sampleValues: z.array(z.string()),
            columnValues: z.array(z.string()),
          })
        ),
        dateColumnName: z.string().nullable(),
        dateColumnValues: z.array(z.string()).nullable(),
        periodDetected: z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).nullable(),
        unmappedColumns: z.array(z.string()),
        questions: z.array(z.object({ sourceColumn: z.string(), prompt: z.string(), options: z.array(z.string()) })),
      }),
    })
  ),
  existingMonths: z.record(z.string(), z.unknown()),
  keySource: z.enum(["byok", "shared"]),
  tokens: z.object({ inputTokens: z.number().int().min(0), outputTokens: z.number().int().min(0) }),
});

type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
type AnalyzeSheet = AnalyzeResponse["sheets"][number];
type MappingEntry = AnalyzeSheet["mapping"]["mappings"][number];

function isMonthlyMetricKey(value: string | null): value is MonthlyMetricKey {
  return value !== null && MONTHLY_KEYS.has(value);
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const withoutParentheses = isNegative ? trimmed.slice(1, -1) : trimmed;
  const compactMatch = withoutParentheses
    .replace(/[€$£%\s]/g, "")
    .match(/^(-?[\d\s.,]+)([km])$/i);
  const compactValue = compactMatch ? compactMatch[1] : withoutParentheses.replace(/[€$£%\s]/g, "");
  const multiplier = compactMatch?.[2]?.toLowerCase() === "m" ? 1_000_000 : compactMatch?.[2] ? 1_000 : 1;
  const hasComma = compactValue.includes(",");
  const hasDot = compactValue.includes(".");
  let normalized = compactValue;

  if (hasComma && hasDot) {
    normalized = compactValue.lastIndexOf(",") > compactValue.lastIndexOf(".") ? compactValue.replace(/\./g, "").replace(",", ".") : compactValue.replace(/,/g, "");
  } else if (hasComma) {
    normalized = /,\d{1,2}$/.test(compactValue) ? compactValue.replace(",", ".") : compactValue.replace(/,/g, "");
  }

  const parsed = Number(normalized) * multiplier;
  if (!Number.isFinite(parsed)) return null;
  return isNegative ? -parsed : parsed;
}

function parsePeriod(raw: string): ImportPeriod | null {
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };

  const french = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (french) {
    let year = Number(french[3]);
    if (year < 100) year += 2000;
    return { year, month: Number(french[2]) };
  }

  return null;
}

function groupRowsByMonth(values: string[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  values.forEach((value, index) => {
    const parsed = parsePeriod(value);
    if (!parsed || parsed.month < 1 || parsed.month > 12) return;
    const key = `${parsed.year}-${parsed.month}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return groups;
}

function aggregateValues(values: string[], rowIndexes: number[], granularity: MappingEntry["granularity"]): number | null {
  const numbers = rowIndexes
    .map((index) => parseNumber(values[index] ?? ""))
    .filter((value): value is number => value !== null);
  if (numbers.length === 0) return null;
  if (granularity === "monthly") return numbers[numbers.length - 1] ?? null;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function samePeriod(a: ImportPeriod | null, b: ImportPeriod): boolean {
  return a?.year === b.year && a.month === b.month;
}

function confidenceRank(confidence: MappedField["confidence"]): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function confidenceLabel(confidence: MappedField["confidence"]): string {
  return confidence === "high" ? "forte" : confidence === "medium" ? "moyenne" : "faible";
}

function mergeField(fields: MappedField[], next: MappedField, notes: string[]) {
  const existing = fields.find((field) => field.key === next.key);
  if (!existing) {
    fields.push(next);
    return;
  }

  const currentValue = parseNumber(existing.value) ?? 0;
  const nextValue = parseNumber(next.value) ?? 0;
  existing.value = String(currentValue + nextValue);
  existing.source = `${existing.source} + ${next.source}`;
  existing.confidence = confidenceRank(existing.confidence) >= confidenceRank(next.confidence) ? existing.confidence : next.confidence;
  notes.push(`Falco a trouvé plusieurs sources pour « ${existing.label} » : vérifie le total proposé.`);
}

function mapAnalysis(analysis: AnalyzeResponse, period: ImportPeriod): {
  fields: MappedField[];
  ignored: string[];
  uncertainties: UncertainMatch[];
  note: string | null;
} {
  const fields: MappedField[] = [];
  const ignored: string[] = [];
  const uncertainties: UncertainMatch[] = [];
  const notes: string[] = [];

  for (const sheet of analysis.sheets) {
    const { mapping } = sheet;
    if (mapping.targetTable === "ignore") {
      ignored.push(`${sheet.fileName} · ${sheet.sheetName} : ${mapping.ignoreReason ?? "hors périmètre"}`);
      continue;
    }
    if (mapping.targetTable !== "monthly_metrics") {
      ignored.push(`${sheet.fileName} · ${sheet.sheetName} : Falco l'a classée dans ${mapping.targetTable}, pas dans les KPI mensuels.`);
      continue;
    }

    const dateGroups = mapping.dateColumnValues ? groupRowsByMonth(mapping.dateColumnValues) : new Map<string, number[]>();
    const targetRows = dateGroups.get(`${period.year}-${period.month}`);
    const hasReadableDates = dateGroups.size > 0;

    if (hasReadableDates && !targetRows) {
      ignored.push(`${sheet.fileName} · ${sheet.sheetName} : aucune ligne pour ${String(period.month).padStart(2, "0")}/${period.year}.`);
      continue;
    }

    if (!hasReadableDates && mapping.periodDetected && !samePeriod(mapping.periodDetected, period)) {
      ignored.push(`${sheet.fileName} · ${sheet.sheetName} : la période détectée est ${mapping.periodDetected.month}/${mapping.periodDetected.year}.`);
      continue;
    }

    const rowCount = Math.max(0, ...mapping.mappings.map((entry) => entry.columnValues.length));
    const rows = targetRows ?? Array.from({ length: rowCount }, (_, index) => index);
    if (hasReadableDates && targetRows && targetRows.length > 1) {
      notes.push(`${sheet.sheetName} : ${targetRows.length} lignes de ${String(period.month).padStart(2, "0")}/${period.year} additionnées en code.`);
    }
    if (!hasReadableDates && !mapping.periodDetected) {
      notes.push(`${sheet.sheetName} : Falco a utilisé le mois ouvert, ${String(period.month).padStart(2, "0")}/${period.year}.`);
    }

    const sheetQuestions = mapping.questions
      .map((question, questionIndex) => {
        const options = [...new Set(question.options.filter(isMonthlyMetricKey))];
        if (options.length === 0) return null;
        const entry = mapping.mappings.find((candidate) => candidate.sourceColumn === question.sourceColumn);
        const value = entry ? aggregateValues(entry.columnValues, rows, entry.granularity) : null;
        const id = `${sheet.fileName}:${sheet.sheetName}:${question.sourceColumn}:${questionIndex}`;
        const uncertainty: UncertainMatch = {
          id,
          sourceColumn: question.sourceColumn,
          source: `« ${question.sourceColumn} » · ${sheet.sheetName}`,
          prompt: question.prompt,
          options,
          sampleValues: entry?.sampleValues ?? [],
          candidateValue: value === null ? null : String(value),
          linkedFieldKey: entry && isMonthlyMetricKey(entry.targetField) ? entry.targetField : null,
          status: "pending",
        };
        uncertainties.push(uncertainty);
        return { sourceColumn: question.sourceColumn, id };
      })
      .filter((question): question is { sourceColumn: string; id: string } => question !== null);

    for (const entry of mapping.mappings) {
      if (!isMonthlyMetricKey(entry.targetField)) continue;
      const value = aggregateValues(entry.columnValues, rows, entry.granularity);
      if (value === null) continue;
      const uncertaintyId = sheetQuestions.find((question) => question.sourceColumn === entry.sourceColumn)?.id;
      mergeField(
        fields,
        {
          key: entry.targetField,
          label: FIELD_LABELS[entry.targetField],
          value: String(value),
          source: `« ${entry.sourceColumn} » · ${sheet.sheetName}`,
          confidence: entry.confidence,
          uncertaintyId,
        },
        notes
      );
    }

    ignored.push(...mapping.unmappedColumns.map((column) => `${sheet.sheetName} · colonne non utilisée : « ${column} »`));
  }

  return { fields, ignored, uncertainties, note: [...new Set(notes)].join(" ") || null };
}

function errorMessageFromBody(body: unknown): string | null {
  const parsed = z.object({ error: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.error : null;
}

export function MonthlyKpiImport({
  period,
  sourceManagedFields = [],
  nonOverridableFields = [],
  onApply,
}: {
  period: ImportPeriod;
  sourceManagedFields?: ReadonlyArray<MonthlyMetricKey>;
  nonOverridableFields?: ReadonlyArray<MonthlyMetricKey>;
  onApply: (values: Partial<MonthlyMetricsInput>, count: number, usage?: MonthlyKpiImportUsage) => void;
}) {
  const [step, setStep] = useState<"input" | "analyzing" | "review">("input");
  const [fields, setFields] = useState<MappedField[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [uncertainties, setUncertainties] = useState<UncertainMatch[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [usage, setUsage] = useState<MonthlyKpiImportUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFilesSelected(files: File[]) {
    if (files.length === 0) return;
    setStep("analyzing");
    setError(null);
    setUsage(null);

    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file, file.name);
      formData.append("targetTableHint", "monthly_metrics");
      formData.append("targetPeriod", JSON.stringify(period));

      const response = await fetch("/api/import/analyze", { method: "POST", body: formData });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessageFromBody(body) ?? "Falco n'a pas pu analyser ce contenu.");

      const parsed = analyzeResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error("Falco a renvoyé une analyse impossible à vérifier. Réessaie avec ce fichier.");

      const mapped = mapAnalysis(parsed.data, period);
      if (mapped.fields.length === 0 && mapped.uncertainties.length === 0) {
        throw new Error("Falco n'a trouvé aucun chiffre correspondant aux KPI de ce mois. Essaie avec le fichier original, une capture ou un collage plus complet.");
      }

      setFields(mapped.fields);
      setIgnored(mapped.ignored);
      setUncertainties(mapped.uncertainties);
      setNote(mapped.note);
      setUsage({
        fileHashes: [...new Set(parsed.data.sheets.map((sheet) => sheet.fileHash))],
        keySource: parsed.data.keySource,
        inputTokens: parsed.data.tokens.inputTokens,
        outputTokens: parsed.data.tokens.outputTokens,
        fieldsCount: mapped.fields.length,
      });
      setStep("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de demander l'analyse à Falco.");
      setStep("input");
    }
  }

  function handleApply() {
    const values: Partial<MonthlyMetricsInput> = {};
    let count = 0;
    for (const field of fields) {
      if (nonOverridableFields.includes(field.key)) continue;
      const parsed = parseNumber(field.value);
      if (parsed === null) continue;
      values[field.key] = parsed;
      count += 1;
    }
    if (count === 0) {
      setError("Aucune valeur modifiable à appliquer. Les champs gérés automatiquement restent inchangés.");
      return;
    }
    onApply(values, count, usage ? { ...usage, fieldsCount: count } : undefined);
  }

  function resolveUncertainty(uncertaintyId: string, key: MonthlyMetricKey) {
    const uncertainty = uncertainties.find((candidate) => candidate.id === uncertaintyId);
    if (!uncertainty) return;

    setFields((current) => {
      const linkedIndex = current.findIndex((field) => field.uncertaintyId === uncertaintyId);
      const next = [...current];
      if (linkedIndex >= 0) {
        const linked = next[linkedIndex];
        if (!linked) return current;
        next[linkedIndex] = { ...linked, key, label: FIELD_LABELS[key], confidence: "high", uncertaintyId: undefined };
        return next;
      }

      const value = uncertainty.candidateValue === null ? null : parseNumber(uncertainty.candidateValue);
      if (value === null) return current;
      mergeField(
        next,
        {
          key,
          label: FIELD_LABELS[key],
          value: String(value),
          source: uncertainty.source,
          confidence: "high",
        },
        []
      );
      return next;
    });
    setUncertainties((current) =>
      current.map((candidate) => (candidate.id === uncertaintyId ? { ...candidate, status: "resolved", linkedFieldKey: key } : candidate))
    );
  }

  function ignoreUncertainty(uncertaintyId: string) {
    setFields((current) => current.filter((field) => field.uncertaintyId !== uncertaintyId));
    setUncertainties((current) => current.map((candidate) => (candidate.id === uncertaintyId ? { ...candidate, status: "ignored" } : candidate)));
  }

  if (step === "analyzing") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status" aria-live="polite">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent-2-soft text-accent-2-text">
          <span className="size-4 animate-pulse rounded-full bg-accent-2" />
        </span>
        <p className="text-sm font-bold">Falco comprend ton tableau…</p>
        <p className="text-xs text-muted-foreground">Il peut lire un CSV, un Excel, un PDF, une capture ou un collage libre.</p>
      </div>
    );
  }

  if (step === "review") {
    const pendingUncertainties = uncertainties.filter((uncertainty) => uncertainty.status === "pending");
    const editableCount = fields.filter((field) => !nonOverridableFields.includes(field.key)).length;
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-state-healthy" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-state-healthy">{fields.length} KPI identifié{fields.length > 1 ? "s" : ""} par Falco</p>
            <p className="mt-1 text-xs text-state-healthy/80">
              Revue pour {String(period.month).padStart(2, "0")}/{period.year}. Corrige les valeurs si besoin : rien ne sera écrit avant ta confirmation.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {fields.map((field) => {
            const isNonOverridable = nonOverridableFields.includes(field.key);
            const isSourceManaged = sourceManagedFields.includes(field.key);
            const inputId = `monthly-import-${field.key}`;
            return (
              <div key={field.key} className="grid gap-2 rounded-[var(--radius-control)] border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{field.label}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Confiance {confidenceLabel(field.confidence)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{field.source}</p>
                  {isSourceManaged && !isNonOverridable && (
                    <p className="mt-1 text-xs font-bold text-state-caution">Source connectée : une correction ici conservera un override pour ce mois.</p>
                  )}
                  {isNonOverridable && <p className="mt-1 text-xs font-bold text-state-caution">Géré par Stripe : modifie la source pour le changer.</p>}
                </div>
                <label className="flex items-center gap-2 sm:justify-end" htmlFor={inputId}>
                  <span className="sr-only">Valeur pour {field.label}</span>
                  <input
                    id={inputId}
                    type="text"
                    inputMode="decimal"
                    value={field.value}
                    disabled={isNonOverridable}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFields((current) => current.map((candidate) => (candidate.key === field.key ? { ...candidate, value } : candidate)));
                    }}
                    className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-right text-sm font-bold tabular-nums outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted-foreground"
                  />
                </label>
              </div>
            );
          })}
        </div>

        {pendingUncertainties.length > 0 && (
          <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution-bg p-3" role="status">
            <div>
              <p className="text-sm font-bold text-state-caution">
                {pendingUncertainties.length} correspondance{pendingUncertainties.length > 1 ? "s" : ""} à confirmer
              </p>
              <p className="mt-1 text-xs text-state-caution/80">Falco te montre exactement la colonne concernée avant de la placer dans un KPI.</p>
            </div>
            {pendingUncertainties.map((uncertainty) => (
              <div key={uncertainty.id} className="rounded-[calc(var(--radius-control)-2px)] border border-state-caution/30 bg-background p-3">
                <p className="text-sm font-bold">{uncertainty.sourceColumn}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{uncertainty.source}</p>
                {uncertainty.sampleValues.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Valeurs vues : {uncertainty.sampleValues.map((sample) => `« ${sample} »`).join(" · ")}
                  </p>
                )}
                <p className="mt-2 text-sm font-bold">{uncertainty.prompt}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {uncertainty.options.map((option) => (
                    <Button key={option} type="button" size="sm" variant="outline" onClick={() => resolveUncertainty(uncertainty.id, option)}>
                      {FIELD_LABELS[option]}
                    </Button>
                  ))}
                  <Button type="button" size="sm" variant="secondary" onClick={() => ignoreUncertainty(uncertainty.id)}>
                    Ignorer cette colonne
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {ignored.length > 0 && <p className="text-xs text-muted-foreground">Éléments non utilisés : {ignored.map((item) => `« ${item} »`).join(" · ")}</p>}
        {note && <p className="rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution-bg px-3 py-2 text-xs text-state-caution">{note}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="accent2" onClick={handleApply} disabled={editableCount === 0 || pendingUncertainties.length > 0}>
            Utiliser ces chiffres
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setStep("input");
              setFields([]);
              setIgnored([]);
              setUncertainties([]);
              setNote(null);
              setUsage(null);
              setError(null);
            }}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Recommencer
          </Button>
        </div>
        {nonOverridableFields.length > 0 && fields.some((field) => nonOverridableFields.includes(field.key)) && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Les valeurs Stripe restent pilotées par Stripe et ne seront pas écrites depuis cet import.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ImportDropzone onFilesSelected={handleFilesSelected} allowPaste />
      {error && (
        <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm text-state-critical" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Cible : {String(period.month).padStart(2, "0")}/{period.year}. Falco analyse le contenu, pas seulement la ligne de titres.</p>
    </div>
  );
}
