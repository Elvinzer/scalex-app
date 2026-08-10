"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import { aggregateColumnValues, aggregateColumnValuesForRows, groupValuesByMonth } from "@/lib/import/aggregate";
import { parseLocaleNumber } from "@/lib/import/parse";
import type { AnalyzeSheetResult, CommitImportPayload } from "@/lib/import/schema";
import { cn } from "@/lib/utils";

// Fields whose values are text, never summed/averaged — everything else is
// treated as numeric (parseLocaleNumber). The sales target relies on this to
// know which raw cell value to pass through as-is vs. parse as a number.
const STRING_FIELDS = new Set([
  "clientName",
  "clientEmail",
  "sourceChannel",
  "paymentType",
  "saleDate",
  "closer",
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
type DataTranslator = (key: string, values?: Record<string, string | number>) => string;

function monthLabel(year: number, month: number, locale: string): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
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
function buildMonthlyMetricsGroups(sheet: AnalyzeSheetResult, sheetIndex: number, locale: string, t: DataTranslator): ResolvedGroup[] {
  const { mapping } = sheet;
  const buckets = mapping.dateColumnValues ? groupValuesByMonth(mapping.dateColumnValues) : null;

  if (buckets) {
    return buckets.map((bucket) => {
      const daysElapsed = daysElapsedInMonth(bucket.year, bucket.month);
      return {
        key: `sheet${sheetIndex}-${bucket.year}-${bucket.month}`,
        sheetIndex,
        label: monthLabel(bucket.year, bucket.month, locale),
        year: bucket.year,
        month: bucket.month,
        incompleteDaysCount: daysElapsed !== null && bucket.rowIndexes.length < daysElapsed ? bucket.rowIndexes.length : undefined,
        fields: mapping.mappings
          .filter((entry) => entry.targetField)
          .map((entry) => ({
            targetField: entry.targetField as string,
            value: aggregateColumnValuesForRows(entry.columnValues, bucket.rowIndexes, entry.granularity),
            sourceLabel: t("importPreview.sourceRows", { column: entry.sourceColumn, count: bucket.rowIndexes.length, plural: bucket.rowIndexes.length > 1 ? "s" : "", month: monthLabel(bucket.year, bucket.month, locale) }),
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
      label: monthLabel(year, month, locale),
      year,
      month,
      fields: mapping.mappings
        .filter((entry) => entry.targetField)
        .map((entry) => ({
          targetField: entry.targetField as string,
          value: aggregateColumnValues(entry.columnValues, entry.granularity),
          sourceLabel: entry.granularity === "monthly"
            ? t("importPreview.sourceMonthly", { column: entry.sourceColumn })
            : t("importPreview.sourceRepeated", { column: entry.sourceColumn, granularity: t(`importPreview.granularity.${entry.granularity}`), count: entry.columnValues.length }),
          confidence: entry.confidence,
        })),
    },
  ];
}

// sales: one row = one entity (a sale) — never aggregated together. Builds
// one group per row that has at least one mapped value, each field read at
// that row's own index.
function buildRowLevelGroups(sheet: AnalyzeSheetResult, sheetIndex: number, t: DataTranslator): ResolvedGroup[] {
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
        return { targetField, value, sourceLabel: t("importPreview.sourceRow", { column: entry.sourceColumn, row: rowIndex + 1 }), confidence: entry.confidence };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    if (fields.length === 0) continue;

    const dateField = fields.find((f) => f.targetField === "saleDate");
    const parsedDate = dateField ? new Date(`${dateField.value}T00:00:00Z`) : null;
    const year = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getUTCFullYear() : new Date().getUTCFullYear();
    const month = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getUTCMonth() + 1 : new Date().getUTCMonth() + 1;
    const titleField = fields.find((f) => f.targetField === "clientName");

    groups.push({
      key: `sheet${sheetIndex}-row${rowIndex}`,
      sheetIndex,
      label: String(titleField?.value ?? t("importPreview.defaultRow", { row: rowIndex + 1 })),
      year,
      month,
      fields,
    });
  }
  return groups;
}

function buildGroups(sheets: AnalyzeSheetResult[], locale: string, t: DataTranslator): ResolvedGroup[] {
  return sheets.flatMap((sheet, sheetIndex) => {
    if (sheet.mapping.targetTable === "ignore") return [];
    if (sheet.mapping.targetTable === "monthly_metrics") return buildMonthlyMetricsGroups(sheet, sheetIndex, locale, t);
    return buildRowLevelGroups(sheet, sheetIndex, t);
  });
}

// Replaces the single "Aucune valeur exploitable détectée" message with one
// that says WHERE it broke — the fixed date-serial bug (lib/import/aggregate.ts)
// means this now only fires for genuinely different failures, each with its
// own actionable text instead of one catch-all.
function diagnoseNoUsableData(sheets: AnalyzeSheetResult[], t: (key: string, values?: Record<string, string | number>) => string): string {
  const relevantSheets = sheets.filter((s) => s.mapping.targetTable !== "ignore");

  if (relevantSheets.length === 0) {
    const reasons = sheets.map((s) => s.mapping.ignoreReason).filter((r): r is string => Boolean(r));
    return reasons.length > 0
      ? t("importPreview.allIgnored", { reasons: reasons.join(" · ") })
      : t("importPreview.noSheets");
  }

  // A date column was identified but every single value in it failed to
  // parse (dateColumnValues from enrichMapping is "" for an unparseable
  // cell — see lib/import/aggregate.ts's normalizeDateCellToIso), and there's
  // no whole-sheet period to fall back on either.
  const hasUnreadableDateColumn = relevantSheets.some(
    (s) =>
      s.mapping.targetTable === "monthly_metrics" &&
      s.mapping.dateColumnName &&
      !s.mapping.periodDetected &&
      (s.mapping.dateColumnValues === null || s.mapping.dateColumnValues.every((v) => v.trim() === ""))
  );
  if (hasUnreadableDateColumn) {
    return t("importPreview.unreadableDates");
  }

  return t("importPreview.noData");
}

export function ImportPreview({
  sheets,
  existingMonths,
  tokens,
  keySource,
  onCommit,
  onCancel,
  isCommitting,
}: {
  sheets: AnalyzeSheetResult[];
  existingMonths: Record<string, Record<string, unknown> | null>;
  tokens: { inputTokens: number; outputTokens: number };
  keySource: "byok" | "shared";
  onCommit?: (payloads: CommitImportPayload[]) => void;
  onCancel: () => void;
  isCommitting: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("data");
  const groups = useMemo(() => buildGroups(sheets, locale, t), [sheets, locale, t]);
  const ignoredSheets = sheets.filter((s) => s.mapping.targetTable === "ignore");
  const unmappedColumns = sheets.flatMap((s) => (s.mapping.targetTable === "ignore" ? [] : s.mapping.unmappedColumns));
  const [conflictChoices, setConflictChoices] = useState<Record<string, "keep" | "replace">>({});
  // Lets the user correct a value the AI misread before committing —
  // keyed by group+field so edits don't leak across months/rows. Falls
  // back to the computed value until the user actually touches a field.
  const [valueOverrides, setValueOverrides] = useState<Record<string, number | string>>({});

  function overrideKey(groupKey: string, targetField: string): string {
    return `${groupKey}::${targetField}`;
  }

  function resolvedValue(group: ResolvedGroup, field: ResolvedGroup["fields"][number]): number | string {
    const key = overrideKey(group.key, field.targetField);
    return key in valueOverrides ? valueOverrides[key] : field.value;
  }

  function handleValueChange(group: ResolvedGroup, field: ResolvedGroup["fields"][number], raw: string) {
    const key = overrideKey(group.key, field.targetField);
    const next: number | string = STRING_FIELDS.has(field.targetField) ? raw : raw === "" ? 0 : Number(raw);
    setValueOverrides((prev) => ({ ...prev, [key]: next }));
  }

  // Same editable input used both for a fresh value and for the "new"
  // side of a conflict — the user can correct what the AI read before
  // committing either way, not just accept/reject it as-is.
  function renderValueField(group: ResolvedGroup, field: ResolvedGroup["fields"][number]) {
    const value = resolvedValue(group, field);
    if (STRING_FIELDS.has(field.targetField)) {
      return (
        <input
          type="text"
          value={String(value)}
          onChange={(event) => handleValueChange(group, field, event.target.value)}
          className="w-28 min-w-0 rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-right text-sm font-bold outline-none focus-visible:border-accent sm:w-40"
        />
      );
    }
    return (
      <input
        type="number"
        min={0}
        value={value as number}
        onChange={(event) => handleValueChange(group, field, event.target.value)}
        className="w-24 rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-right text-sm font-bold tabular-nums outline-none focus-visible:border-accent"
      />
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Falco pose="sleeping" size="md" animate="enter" />
        <p className="text-sm text-muted-foreground">{diagnoseNoUsableData(sheets, t)}</p>
        <Button variant="secondary" onClick={onCancel}>
          {t("importPreview.cancel")}
        </Button>
      </div>
    );
  }

  function handleCommit() {
    // One commit call per distinct (sheet's targetTable) — a single file
    // can have sheets going to different tables (monthly_metrics + sales
    // in the same workbook), and commitImportPayloadSchema is
    // one-table-per-call.
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
          values: Object.fromEntries(group.fields.map((f) => [f.targetField, resolvedValue(group, f)])),
          conflictChoices,
          incompleteDaysCount: group.incompleteDaysCount,
        })),
      });
    }
    onCommit?.(payloads);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft/60 px-3 py-2.5">
        <p className="text-sm font-bold text-accent-2-text">{t("importPreview.readyTitle")}</p>
        <p className="mt-1 text-xs text-accent-2-text/80">{t("importPreview.readyHelp")}</p>
      </div>

      {groups.map((group) => {
        const monthKey = `${group.year}-${group.month}`;
        const existing = sheets[group.sheetIndex].mapping.targetTable === "monthly_metrics" ? existingMonths[monthKey] : null;
        return (
          <div key={group.key} className="sticker-card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{group.label}</p>
              {group.incompleteDaysCount !== undefined && (
                <span className="rounded-full bg-state-caution-bg px-2 py-0.5 text-xs font-bold text-state-caution">
                  {t("importPreview.daysData", { month: monthLabel(group.year, group.month, locale), count: group.incompleteDaysCount, plural: group.incompleteDaysCount > 1 ? "s" : "" })}
                </span>
              )}
            </div>
            {group.fields.map((field) => {
              const existingValue = existing ? (existing as Record<string, unknown>)[field.targetField] : null;
              const hasConflict = existing !== null && existingValue !== null && existingValue !== undefined;
              return (
                <div
                  key={field.targetField}
                  className="flex flex-col items-start justify-between gap-2 border-t border-border py-2 first:border-t-0 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div>
                    <p className="text-sm font-bold">{t(`importFields.${field.targetField}`)}</p>
                    <p className="text-xs text-muted-foreground">{field.sourceLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", CONFIDENCE_CLASS[field.confidence])}>
                      {t("importPreview.confidence", { value: t(`importPreview.confidenceValues.${field.confidence}`) })}
                    </span>
                    {hasConflict ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground line-through">{String(existingValue)}</span>
                        <span>→</span>
                        {renderValueField(group, field)}
                        <select
                          value={conflictChoices[field.targetField] ?? "replace"}
                          onChange={(event) =>
                            setConflictChoices((prev) => ({ ...prev, [field.targetField]: event.target.value as "keep" | "replace" }))
                          }
                          className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-xs outline-none"
                        >
                          <option value="replace">{t("importPreview.replace")}</option>
                          <option value="keep">{t("importPreview.keep")}</option>
                        </select>
                      </div>
                    ) : (
                      renderValueField(group, field)
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
              {t("importPreview.ignoredSheet", { sheet: sheet.sheetName, reason: sheet.mapping.ignoreReason ?? t("importPreview.noReason") })}
            </p>
          ))}
        </div>
      )}

      {unmappedColumns.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("importPreview.ignored", { columns: unmappedColumns.map((c) => `"${c}"`).join(", ") })}</p>
      )}

      <div className="flex gap-2">
        <Button onClick={handleCommit} disabled={isCommitting}>
          {isCommitting ? t("importPreview.validation") : t("importPreview.validate", { count: groups.reduce((sum, g) => sum + g.fields.length, 0) })}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isCommitting}>
          {t("importPreview.cancel")}
        </Button>
      </div>
    </div>
  );
}
