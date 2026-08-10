"use client";

import Papa from "papaparse";
import { useState } from "react";

import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MonthlyMetricsInput } from "@/lib/monthly-metrics/types";

import { ImportDropzone } from "./import-dropzone";

type MonthlyMetricKey = keyof MonthlyMetricsInput;
type ImportPeriod = { year: number; month: number };

type MetricDefinition = {
  key: MonthlyMetricKey;
  label: string;
  aliases: string[];
};

type MappedField = {
  key: MonthlyMetricKey;
  label: string;
  value: string;
  source: string;
};

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: "cashCollected",
    label: "CA collecté (€)",
    aliases: ["ca collecte", "ca encaisse", "cash collected", "chiffre affaires encaisse", "revenus encaisses", "payments received", "revenue collected"],
  },
  {
    key: "cashContracted",
    label: "CA contracté (€)",
    aliases: ["ca contracte", "ca signe", "chiffre affaires contracte", "revenus signes", "cash contracted", "revenue booked", "deals signed"],
  },
  {
    key: "newFollowers",
    label: "Nouveaux abonnés",
    aliases: ["nouveaux abonnes", "nouveaux followers", "new followers", "new subscribers", "followers gagnes", "nouveaux leads", "new leads", "leads"],
  },
  {
    key: "firstMessages",
    label: "Premiers messages envoyés",
    aliases: ["premiers messages", "messages envoyes", "first messages", "outbound messages"],
  },
  {
    key: "conversations",
    label: "Conversations démarrées",
    aliases: ["conversations demarrees", "conversations engagees", "conversations started", "started conversations"],
  },
  {
    key: "callsProposed",
    label: "Appels proposés",
    aliases: ["appels proposes", "rdv proposes", "calls proposed", "appointments offered"],
  },
  {
    key: "callsBooked",
    label: "Appels réservés",
    aliases: ["appels reserves", "rdv reserves", "rdv fixes", "calls booked", "appointments booked"],
  },
  {
    key: "callsTaken",
    label: "Appels pris",
    aliases: ["appels pris", "appels honores", "rdv honores", "calls taken", "calls attended", "show ups"],
  },
  {
    key: "salesClosed",
    label: "Ventes conclues",
    aliases: ["ventes conclues", "ventes signees", "sales closed", "closed sales", "deals closed", "nombre de ventes"],
  },
];

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMetric(value: string): MetricDefinition | null {
  const normalized = normalizeLabel(value);
  if (!normalized) return null;

  return (
    METRIC_DEFINITIONS.find((definition) =>
      definition.aliases.some((alias) => {
        const normalizedAlias = normalizeLabel(alias);
        return normalized === normalizedAlias || normalized.includes(normalizedAlias);
      })
    ) ?? null
  );
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/[€$£\s%]/g, "");
  if (!trimmed) return null;

  const isNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const withoutParentheses = isNegative ? trimmed.slice(1, -1) : trimmed;
  const compactMatch = withoutParentheses.match(/^(-?[\d\s.,]+)([km])$/i);
  const compactValue = compactMatch ? compactMatch[1] : withoutParentheses;
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

function periodMatches(raw: string, period: ImportPeriod): boolean {
  const normalized = normalizeLabel(raw);
  const monthNames = [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
  ];
  const monthName = monthNames[period.month - 1];
  return (
    normalized.includes(String(period.year)) &&
    (normalized.includes(monthName) || normalized.includes(String(period.month).padStart(2, "0")) || normalized.includes(` ${period.month} `))
  );
}

function isPeriodHeader(value: string): boolean {
  const normalized = normalizeLabel(value);
  return normalized.includes("mois") || normalized.includes("month") || normalized.includes("periode") || normalized.includes("period") || normalized === "date";
}

function mapRows(rows: string[][], period: ImportPeriod): { fields: MappedField[]; ignored: string[]; note: string | null } {
  const horizontalHeaderIndex = rows.findIndex((row, index) => index < 8 && row.filter((cell) => findMetric(cell)).length >= 2);
  const fields: MappedField[] = [];
  const usedKeys = new Set<MonthlyMetricKey>();
  const ignored: string[] = [];

  if (horizontalHeaderIndex >= 0) {
    const headers = rows[horizontalHeaderIndex] ?? [];
    const dataRows = rows.slice(horizontalHeaderIndex + 1).filter((row) => row.some((cell) => cell.trim().length > 0));
    const periodIndex = headers.findIndex(isPeriodHeader);
    const periodRows = periodIndex >= 0 ? dataRows.filter((row) => periodMatches(row[periodIndex] ?? "", period)) : dataRows;

    if (periodRows.length === 0) {
      throw new Error(`Je ne trouve aucune ligne pour ${String(period.month).padStart(2, "0")}/${period.year}. Vérifie la période ou utilise la saisie manuelle.`);
    }

    headers.forEach((header, index) => {
      const definition = findMetric(header);
      if (!definition) {
        if (header.trim() && !isPeriodHeader(header)) ignored.push(header.trim());
        return;
      }
      if (usedKeys.has(definition.key)) return;
      const parsedValues = periodRows.map((row) => parseNumber(row[index] ?? "")).filter((value): value is number => value !== null);
      const parsed = parsedValues.length > 1 ? parsedValues.reduce((sum, value) => sum + value, 0) : parsedValues[0] ?? null;
      if (parsed === null) return;
      usedKeys.add(definition.key);
      fields.push({
        key: definition.key,
        label: definition.label,
        value: String(parsed),
        source: `Colonne « ${header.trim()} »${parsedValues.length > 1 ? `, ${parsedValues.length} lignes additionnées` : ""}`,
      });
    });

    return {
      fields,
      ignored,
      note: dataRows.length > 1 && periodIndex < 0 ? "Plusieurs lignes ont été trouvées : Falco les a additionnées. Ajoute une colonne « Mois » ou « Date » pour importer plusieurs périodes." : null,
    };
  }

  rows.forEach((row) => {
    const nonEmpty = row.map((cell) => cell.trim()).filter(Boolean);
    const label = nonEmpty[0] ?? "";
    const definition = findMetric(label);
    if (!definition || usedKeys.has(definition.key)) return;
    const rawValue = nonEmpty.slice(1).find((cell) => parseNumber(cell) !== null);
    const parsed = rawValue === undefined ? null : parseNumber(rawValue);
    if (parsed === null) return;
    usedKeys.add(definition.key);
    fields.push({
      key: definition.key,
      label: definition.label,
      value: String(parsed),
      source: `Ligne « ${label} »`,
    });
  });

  return { fields, ignored, note: null };
}

function parseRows(text: string): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    delimitersToGuess: ["\t", ",", ";", "|"],
  });
  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error("Le tableau n’est pas lisible. Vérifie que le CSV est bien séparé par des virgules ou des tabulations.");
  }
  return result.data.map((row) => row.map((cell) => String(cell ?? "")));
}

export function MonthlyKpiImport({
  period,
  blockedFields = [],
  onApply,
}: {
  period: ImportPeriod;
  blockedFields?: ReadonlyArray<MonthlyMetricKey>;
  onApply: (values: Partial<MonthlyMetricsInput>, count: number) => void;
}) {
  const [step, setStep] = useState<"input" | "analyzing" | "review">("input");
  const [fields, setFields] = useState<MappedField[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFilesSelected(files: File[]) {
    const file = files[0];
    if (!file) return;
    setStep("analyzing");
    setError(null);
    try {
      if (!/\.(csv|tsv)$/i.test(file.name)) {
        throw new Error("Pour cette popup, envoie un CSV/TSV ou colle directement les cellules depuis Excel/Google Sheets.");
      }
      const mapped = mapRows(parseRows(await file.text()), period);
      if (mapped.fields.length === 0) {
        throw new Error("Falco ne reconnaît aucune colonne de KPI. Vérifie la ligne de titres ou utilise la saisie manuelle.");
      }
      setFields(mapped.fields);
      setIgnored(mapped.ignored);
      setNote(mapped.note);
      setStep("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de lire ce tableau.");
      setStep("input");
    }
  }

  function handleApply() {
    const values: Partial<MonthlyMetricsInput> = {};
    let count = 0;
    for (const field of fields) {
      if (blockedFields.includes(field.key)) continue;
      const parsed = parseNumber(field.value);
      if (parsed === null) continue;
      values[field.key] = parsed;
      count += 1;
    }
    if (count === 0) {
      setError("Aucune valeur modifiable à appliquer. Les champs gérés automatiquement restent inchangés.");
      return;
    }
    onApply(values, count);
  }

  if (step === "analyzing") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status" aria-live="polite">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent-2-soft text-accent-2-text">
          <span className="size-4 animate-pulse rounded-full bg-accent-2" />
        </span>
        <p className="text-sm font-bold">Falco lit ton tableau…</p>
        <p className="text-xs text-muted-foreground">Les valeurs restent dans cette fenêtre jusqu&apos;à ta confirmation.</p>
      </div>
    );
  }

  if (step === "review") {
    const editableCount = fields.filter((field) => !blockedFields.includes(field.key)).length;
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-state-healthy" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-state-healthy">{fields.length} colonne{fields.length > 1 ? "s" : ""} reconnue{fields.length > 1 ? "s" : ""}</p>
            <p className="mt-1 text-xs text-state-healthy/80">Revue pour {period.month.toString().padStart(2, "0")}/{period.year}. Tu peux corriger les valeurs avant de les placer dans le formulaire.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {fields.map((field) => {
            const isBlocked = blockedFields.includes(field.key);
            const inputId = `monthly-import-${field.key}`;
            return (
              <div key={field.key} className="grid gap-2 rounded-[var(--radius-control)] border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{field.label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{field.source}</p>
                  {isBlocked && <p className="mt-1 text-xs font-bold text-state-caution">Géré automatiquement, non modifiable ici</p>}
                </div>
                <label className="flex items-center gap-2 sm:justify-end" htmlFor={inputId}>
                  <span className="sr-only">Valeur pour {field.label}</span>
                  <input
                    id={inputId}
                    type="text"
                    inputMode="decimal"
                    value={field.value}
                    disabled={isBlocked}
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

        {ignored.length > 0 && <p className="text-xs text-muted-foreground">Colonnes ignorées : {ignored.map((column) => `« ${column} »`).join(", ")}</p>}
        {note && <p className="rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution-bg px-3 py-2 text-xs text-state-caution">{note}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="accent2" onClick={handleApply} disabled={editableCount === 0}>
            Utiliser ces chiffres
          </Button>
          <Button variant="secondary" onClick={() => setStep("input")}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Recommencer
          </Button>
        </div>
        {editableCount < fields.length && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {fields.length - editableCount} valeur{fields.length - editableCount > 1 ? "s" : ""} restera{fields.length - editableCount > 1 ? "ont" : "a"} pilotée{fields.length - editableCount > 1 ? "s" : "e"} par une source connectée.
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
      <p className="text-xs text-muted-foreground">Cible : {period.month.toString().padStart(2, "0")}/{period.year}. Les colonnes ambiguës peuvent être corrigées manuellement.</p>
    </div>
  );
}
