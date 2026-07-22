import { parseLocaleNumber, type ParsedFile } from "./parse";
import type { ImportMappingResult } from "./schema";

// A mapping entry enriched with its FULL source column values (not just the
// 5 samples the model saw) — attached server-side after the AI call, never
// by the model itself. For image/PDF-text files (no deterministic column
// structure to look up), this falls back to the model's own sampleValues —
// an honest v1 limitation, not a bug: vision extraction has no underlying
// grid to re-read from.
export type EnrichedMappingEntry = ImportMappingResult["mappings"][number] & { columnValues: string[] };
export type EnrichedMapping = Omit<ImportMappingResult, "mappings"> & {
  mappings: EnrichedMappingEntry[];
  // The date column's own row-aligned values (when dateColumnName resolved
  // to a real column) — used client-side (import-preview.tsx) to group
  // rows by month via groupValuesByMonth below. Never itself a "target
  // field" for monthly_metrics/ad_campaigns: it's a grouping key, not an
  // imported value.
  dateColumnValues: string[] | null;
};

// A date column's raw cell value can arrive as an ISO string, an FR
// dd/mm/yyyy string, or a BARE EXCEL SERIAL NUMBER (e.g. "46198") — the last
// case happens whenever the source file's date column has no explicit date
// number-format (common in programmatically-generated exports, or a column
// left on "General"): ExcelJS then can't recognize the cell as a Date, and
// parse.ts's cellToString faithfully returns the raw number instead (it has
// no column context to safely guess "this number is a date" — a follower
// count of 46198 must NOT become a date just because it's numeric). This is
// therefore the one safe place to add that fallback: every caller here
// already knows it's looking at an identified DATE column.
//
// Epoch 1899-12-30 is the standard Excel serial epoch, already correct for
// any real business date (the historical "Excel treats 1900 as a leap
// year" quirk only affects serials < 60, i.e. dates before 1900-03-01,
// which never occurs in real data) — MAX_PLAUSIBLE_SERIAL is Excel's own
// ceiling (9999-12-31), just to reject an obviously-not-a-date number
// (e.g. a euro amount) rather than silently misreading it.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MIN_PLAUSIBLE_SERIAL = 1;
const MAX_PLAUSIBLE_SERIAL = 2958465;

export function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_MS + serial * 86400000);
}

export function normalizeDateCell(raw: string): { year: number; month: number; day: number } | null {
  const trimmed = raw.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };

  const fr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (fr) {
    const month = Number(fr[2]);
    let year = Number(fr[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12) return null;
    return { year, month, day: Number(fr[1]) };
  }

  if (/^\d+$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial >= MIN_PLAUSIBLE_SERIAL && serial <= MAX_PLAUSIBLE_SERIAL) {
      const date = excelSerialToDate(serial);
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
    }
  }

  return null;
}

export function normalizeDateCellToIso(raw: string): string | null {
  const parsed = normalizeDateCell(raw);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

// Date-typed target fields that can appear inside mapping.mappings itself
// (content_posts' publishedAt, sales' saleDate) rather than through the
// separate dateColumnName mechanism — normalized here too so
// buildRowLevelGroups' `new Date(...)` and buildAdCampaignGroups' string
// min/max both keep working when the source cell was a bare serial number.
const DATE_TARGET_FIELDS = new Set(["publishedAt", "saleDate"]);

export function enrichMapping(parsed: ParsedFile, mapping: ImportMappingResult): EnrichedMapping {
  if (parsed.kind !== "table") {
    return { ...mapping, mappings: mapping.mappings.map((m) => ({ ...m, columnValues: m.sampleValues })), dateColumnValues: null };
  }

  // Matched by sheetName, not always the first sheet — a multi-sheet file
  // previously always read sheets[0] regardless of which sheet the model
  // actually analyzed, silently returning the wrong sheet's values.
  const sheet = parsed.sheets.find((s) => s.name === mapping.sheetName) ?? parsed.sheets[0];
  const columnIndex = new Map(sheet?.headers.map((header, index) => [header.trim().toLowerCase(), index]) ?? []);

  const dateIndex = mapping.dateColumnName ? columnIndex.get(mapping.dateColumnName.trim().toLowerCase()) : undefined;
  const dateColumnValues =
    dateIndex !== undefined ? (sheet?.rows.map((row) => normalizeDateCellToIso(row[dateIndex] ?? "") ?? "") ?? null) : null;

  return {
    ...mapping,
    dateColumnValues,
    mappings: mapping.mappings.map((entry) => {
      const index = columnIndex.get(entry.sourceColumn.trim().toLowerCase());
      const rawValues = index !== undefined ? (sheet?.rows.map((row) => row[index] ?? "") ?? []) : entry.sampleValues;
      const columnValues =
        entry.targetField && DATE_TARGET_FIELDS.has(entry.targetField)
          ? rawValues.map((v) => normalizeDateCellToIso(v) ?? v)
          : rawValues;
      return { ...entry, columnValues };
    }),
  };
}

function extractYearMonth(raw: string): { year: number; month: number } | null {
  const parsed = normalizeDateCell(raw);
  return parsed ? { year: parsed.year, month: parsed.month } : null;
}

export type MonthBucket = { year: number; month: number; rowIndexes: number[] };

// Groups row indexes by calendar month using a date column's REAL values
// (not the model's guess) — the fix for "31 lignes de juillet et juin
// mélangées dans un seul total" (previously every sheet had exactly one
// periodDetected for its whole set of rows). Returns null when the column
// has no parseable dates at all (falls back to periodDetected upstream).
export function groupValuesByMonth(dateColumnValues: string[]): MonthBucket[] | null {
  const buckets = new Map<string, MonthBucket>();
  dateColumnValues.forEach((raw, rowIndex) => {
    const parsed = extractYearMonth(raw);
    if (!parsed) return;
    const key = `${parsed.year}-${parsed.month}`;
    const existing = buckets.get(key);
    if (existing) existing.rowIndexes.push(rowIndex);
    else buckets.set(key, { year: parsed.year, month: parsed.month, rowIndexes: [rowIndex] });
  });
  return buckets.size > 0 ? [...buckets.values()] : null;
}

// Daily/weekly granularity sums across the given rows; monthly granularity
// is already a single whole-month figure (last non-empty value among those
// rows, never summed). Plain deterministic code, no AI involved — the
// model only ever identifies which column maps to which field, at what
// granularity, and (separately) which column is the date column.
export function aggregateColumnValuesForRows(
  columnValues: string[],
  rowIndexes: number[],
  granularity: "daily" | "weekly" | "monthly"
): number {
  const numbers = rowIndexes
    .map((i) => columnValues[i])
    .filter((v): v is string => v !== undefined)
    .map(parseLocaleNumber)
    .filter((n): n is number => n !== null);
  if (numbers.length === 0) return 0;
  if (granularity === "monthly") return numbers[numbers.length - 1];
  return numbers.reduce((sum, n) => sum + n, 0);
}

// Same as aggregateColumnValuesForRows but over the WHOLE column — used
// when there's no date column to group by (single-period sheets, or
// non-table sources like images/PDF text).
export function aggregateColumnValues(columnValues: string[], granularity: "daily" | "weekly" | "monthly"): number {
  return aggregateColumnValuesForRows(columnValues, columnValues.map((_, i) => i), granularity);
}
