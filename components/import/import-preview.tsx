"use client";

import { useMemo, useState } from "react";

import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import { aggregateColumnValues, aggregateColumnValuesForRows, groupValuesByMonth } from "@/lib/import/aggregate";
import { parseLocaleNumber } from "@/lib/import/parse";
import type { AnalyzeSheetResult, CommitImportPayload } from "@/lib/import/schema";
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
  platform: "Plateforme",
  type: "Type",
  title: "Titre",
  publishedAt: "Date de publication",
  url: "Lien",
  views: "Vues",
  likes: "Likes",
  comments: "Commentaires",
  shares: "Partages",
  leads: "Leads",
  clientName: "Client",
  clientEmail: "Email client",
  sourceChannel: "Canal",
  totalPrice: "Montant",
  paymentType: "Type de paiement",
  saleDate: "Date de vente",
  closer: "Closer",
  campaignName: "Campagne",
  spend: "Dépensé",
  impressions: "Impressions",
  clicks: "Clics",
};

// Fields whose values are text, never summed/averaged — everything else is
// treated as numeric (parseLocaleNumber). Row-level targets (content_posts/
// sales/ad_campaigns' campaignName) rely on this to know which raw cell
// value to pass through as-is vs. parse as a number.
const STRING_FIELDS = new Set([
  "platform",
  "type",
  "title",
  "publishedAt",
  "url",
  "clientName",
  "clientEmail",
  "sourceChannel",
  "paymentType",
  "saleDate",
  "closer",
  "campaignName",
]);

const CONFIDENCE_CLASS: Record<string, string> = {
  high: "bg-state-healthy-bg text-state-healthy",
  medium: "bg-state-caution-bg text-state-caution",
  low: "bg-muted text-muted-foreground",
};

type ResolvedGroup = {
  key: string;
  sheetIndex: number;
  label: string;
  year: number;
  month: number;
  incompleteDaysCount?: number;
  fields: { targetField: string; value: number | string; sourceLabel: string; confidence: "high" | "medium" | "low" }[];
};

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

// How many days have actually elapsed in a given month vs. today — used to
// flag "Août : seulement 3 jours de données" only for the CURRENT month,
// never for a fully-past month (which naturally has fewer data rows than
// 31 for perfectly legitimate reasons, e.g. a 30-day month).
function daysElapsedInMonth(year: number, month: number): number | null {
  const now = new Date();
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
  if (!isCurrentMonth) return null;
  return now.getUTCDate();
}

// monthly_metrics: group by the real date column into calendar months
// (falls back to the whole-sheet periodDetected when no date column
// resolved) — each field aggregated (summed, or last-value for "monthly"
// granularity) ONLY over the rows in that month, never the whole column.
function buildMonthlyMetricsGroups(sheet: AnalyzeSheetResult, sheetIndex: number): ResolvedGroup[] {
  const { mapping } = sheet;
  const buckets = mapping.dateColumnValues ? groupValuesByMonth(mapping.dateColumnValues) : null;

  if (buckets) {
    return buckets.map((bucket) => {
      const daysElapsed = daysElapsedInMonth(bucket.year, bucket.month);
      return {
        key: `sheet${sheetIndex}-${bucket.year}-${bucket.month}`,
        sheetIndex,
        label: monthLabel(bucket.year, bucket.month),
        year: bucket.year,
        month: bucket.month,
        incompleteDaysCount: daysElapsed !== null && bucket.rowIndexes.length < daysElapsed ? bucket.rowIndexes.length : undefined,
        fields: mapping.mappings
          .filter((entry) => entry.targetField)
          .map((entry) => ({
            targetField: entry.targetField as string,
            value: aggregateColumnValuesForRows(entry.columnValues, bucket.rowIndexes, entry.granularity),
            sourceLabel: `colonne "${entry.sourceColumn}", ${bucket.rowIndexes.length} ligne${bucket.rowIndexes.length > 1 ? "s" : ""} de ${monthLabel(bucket.year, bucket.month)} additionnées`,
            confidence: entry.confidence,
          })),
      };
    });
  }

  if (!mapping.periodDetected) return [];
  const { year, month } = mapping.periodDetected;
  return [
    {
      key: `sheet${sheetIndex}-${year}-${month}`,
      sheetIndex,
      label: monthLabel(year, month),
      year,
      month,
      fields: mapping.mappings
        .filter((entry) => entry.targetField)
        .map((entry) => ({
          targetField: entry.targetField as string,
          value: aggregateColumnValues(entry.columnValues, entry.granularity),
          sourceLabel: `colonne "${entry.sourceColumn}"${entry.granularity === "monthly" ? ", valeur du mois" : `, ${entry.granularity} × ${entry.columnValues.length}`}`,
          confidence: entry.confidence,
        })),
    },
  ];
}

// content_posts/sales: one row = one entity (a post, a sale) — never
// aggregated together. Builds one group per row that has at least one
// mapped value, each field read at that row's own index.
function buildRowLevelGroups(sheet: AnalyzeSheetResult, sheetIndex: number): ResolvedGroup[] {
  const { mapping } = sheet;
  const mappedEntries = mapping.mappings.filter((entry) => entry.targetField);
  const rowCount = Math.max(0, ...mappedEntries.map((e) => e.columnValues.length));
  const groups: ResolvedGroup[] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const fields = mappedEntries
      .map((entry) => {
        const raw = entry.columnValues[rowIndex] ?? "";
        if (raw.trim() === "") return null;
        const targetField = entry.targetField as string;
        const value = STRING_FIELDS.has(targetField) ? raw.trim() : (parseLocaleNumber(raw) ?? 0);
        return { targetField, value, sourceLabel: `colonne "${entry.sourceColumn}", ligne ${rowIndex + 1}`, confidence: entry.confidence };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    if (fields.length === 0) continue;

    const dateField = fields.find((f) => f.targetField === "publishedAt" || f.targetField === "saleDate");
    const parsedDate = dateField ? new Date(`${dateField.value}T00:00:00Z`) : null;
    const year = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getUTCFullYear() : new Date().getUTCFullYear();
    const month = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getUTCMonth() + 1 : new Date().getUTCMonth() + 1;
    const titleField = fields.find((f) => f.targetField === "title" || f.targetField === "clientName");

    groups.push({
      key: `sheet${sheetIndex}-row${rowIndex}`,
      sheetIndex,
      label: String(titleField?.value ?? `Ligne ${rowIndex + 1}`),
      year,
      month,
      fields,
    });
  }
  return groups;
}

// ad_campaigns: grouped by the campaignName field (or one unnamed campaign
// if none was mapped) — spend/impressions/clicks/leads summed per
// campaign, startDate/endDate = min/max of the date column for its rows.
function buildAdCampaignGroups(sheet: AnalyzeSheetResult, sheetIndex: number): ResolvedGroup[] {
  const { mapping } = sheet;
  const nameEntry = mapping.mappings.find((e) => e.targetField === "campaignName");
  const numericEntries = mapping.mappings.filter((e) => e.targetField && e.targetField !== "campaignName");
  const rowCount = Math.max(nameEntry?.columnValues.length ?? 0, ...numericEntries.map((e) => e.columnValues.length));

  const byCampaign = new Map<string, number[]>();
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const name = nameEntry?.columnValues[rowIndex]?.trim() || "Campagne importée";
    byCampaign.set(name, [...(byCampaign.get(name) ?? []), rowIndex]);
  }

  const dates = mapping.dateColumnValues ?? [];

  return [...byCampaign.entries()].map(([name, rowIndexes]) => {
    const campaignDates = rowIndexes.map((i) => dates[i]).filter((d): d is string => Boolean(d && d.trim()));
    const startDate = campaignDates.length > 0 ? campaignDates.reduce((a, b) => (a < b ? a : b)) : undefined;
    const endDate = campaignDates.length > 0 ? campaignDates.reduce((a, b) => (a > b ? a : b)) : undefined;

    const fields: ResolvedGroup["fields"] = [
      { targetField: "campaignName", value: name, sourceLabel: `colonne "${nameEntry?.sourceColumn ?? "?"}"`, confidence: "high" },
      ...numericEntries.map((entry) => ({
        targetField: entry.targetField as string,
        value: aggregateColumnValuesForRows(entry.columnValues, rowIndexes, entry.granularity),
        sourceLabel: `colonne "${entry.sourceColumn}", ${rowIndexes.length} ligne${rowIndexes.length > 1 ? "s" : ""} de "${name}" additionnées`,
        confidence: entry.confidence,
      })),
    ];
    if (startDate) fields.push({ targetField: "startDate", value: startDate, sourceLabel: "date la plus ancienne", confidence: "high" });
    if (endDate) fields.push({ targetField: "endDate", value: endDate, sourceLabel: "date la plus récente", confidence: "high" });

    const startYear = startDate ? Number(startDate.slice(0, 4)) : new Date().getUTCFullYear();
    const startMonth = startDate ? Number(startDate.slice(5, 7)) : new Date().getUTCMonth() + 1;

    return { key: `sheet${sheetIndex}-campaign-${name}`, sheetIndex, label: name, year: startYear, month: startMonth, fields };
  });
}

function buildGroups(sheets: AnalyzeSheetResult[]): ResolvedGroup[] {
  return sheets.flatMap((sheet, sheetIndex) => {
    if (sheet.mapping.targetTable === "ignore") return [];
    if (sheet.mapping.targetTable === "monthly_metrics") return buildMonthlyMetricsGroups(sheet, sheetIndex);
    if (sheet.mapping.targetTable === "ad_campaigns") return buildAdCampaignGroups(sheet, sheetIndex);
    return buildRowLevelGroups(sheet, sheetIndex);
  });
}

export function ImportPreview({
  sheets,
  existingMonths,
  tokens,
  keySource,
  onCommit,
  onExtracted,
  onCancel,
  isCommitting,
}: {
  sheets: AnalyzeSheetResult[];
  existingMonths: Record<string, Record<string, unknown> | null>;
  tokens: { inputTokens: number; outputTokens: number };
  keySource: "byok" | "shared";
  onCommit?: (payloads: CommitImportPayload[]) => void;
  // Onboarding uses this instead of onCommit: no monthly_metrics row exists
  // yet on a brand new account, so there's nothing to write or conflict
  // with here — just hand the resolved values back so the existing
  // step-2 form (saveOnboardingMonth) commits them, same as manual entry.
  onExtracted?: (values: Record<string, number>, year: number, month: number) => void;
  onCancel: () => void;
  isCommitting: boolean;
}) {
  const groups = useMemo(() => buildGroups(sheets), [sheets]);
  const ignoredSheets = sheets.filter((s) => s.mapping.targetTable === "ignore");
  const unmappedColumns = sheets.flatMap((s) => (s.mapping.targetTable === "ignore" ? [] : s.mapping.unmappedColumns));
  const [conflictChoices, setConflictChoices] = useState<Record<string, "keep" | "replace">>({});

  if (groups.length === 0) {
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
      const first = groups[0];
      const values = Object.fromEntries(first.fields.filter((f) => typeof f.value === "number").map((f) => [f.targetField, f.value as number]));
      onExtracted(values, first.year, first.month);
      return;
    }

    // One commit call per distinct (sheet's targetTable) — a single file
    // can have sheets going to different tables (monthly_metrics + ads +
    // content_posts in the same workbook), and commitImportPayloadSchema
    // is one-table-per-call.
    const payloads: CommitImportPayload[] = [];
    for (const sheet of sheets) {
      if (sheet.mapping.targetTable === "ignore") continue;
      const sheetGroups = groups.filter((g) => sheets[g.sheetIndex] === sheet);
      if (sheetGroups.length === 0) continue;
      payloads.push({
        targetTable: sheet.mapping.targetTable,
        fileHash: sheet.fileHash,
        keySource,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        months: sheetGroups.map((group) => ({
          year: group.year,
          month: group.month,
          values: Object.fromEntries(group.fields.map((f) => [f.targetField, f.value])),
          conflictChoices,
          incompleteDaysCount: group.incompleteDaysCount,
        })),
      });
    }
    onCommit?.(payloads);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-bold">Vérifie avant d&apos;importer</p>

      {groups.map((group) => {
        const monthKey = `${group.year}-${group.month}`;
        const existing = sheets[group.sheetIndex].mapping.targetTable === "monthly_metrics" ? existingMonths[monthKey] : null;
        return (
          <div key={group.key} className="sticker-card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{group.label}</p>
              {group.incompleteDaysCount !== undefined && (
                <span className="rounded-full bg-state-caution-bg px-2 py-0.5 text-xs font-bold text-state-caution">
                  {monthLabel(group.year, group.month)} : seulement {group.incompleteDaysCount} jour{group.incompleteDaysCount > 1 ? "s" : ""} de données
                </span>
              )}
            </div>
            {group.fields.map((field) => {
              const existingValue = existing ? (existing as Record<string, unknown>)[field.targetField] : null;
              const hasConflict = existing !== null && existingValue !== null && existingValue !== undefined;
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

      {ignoredSheets.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {ignoredSheets.map((sheet) => (
            <p key={sheet.sheetName}>
              <span className="font-bold">{sheet.sheetName}</span> : ignorée — {sheet.mapping.ignoreReason}
            </p>
          ))}
        </div>
      )}

      {unmappedColumns.length > 0 && (
        <p className="text-xs text-muted-foreground">Ignorées : {unmappedColumns.map((c) => `"${c}"`).join(", ")}</p>
      )}

      <div className="flex gap-2">
        <Button onClick={handleCommit} disabled={isCommitting}>
          {isCommitting ? "Import en cours..." : onExtracted ? "C'est bon ?" : `Importer ${groups.reduce((sum, g) => sum + g.fields.length, 0)} valeur(s)`}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isCommitting}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
