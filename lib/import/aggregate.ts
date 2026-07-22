import type { ParsedFile } from "./parse";
import type { ImportMappingResult } from "./schema";

// A mapping entry enriched with its FULL source column values (not just the
// 5 samples the model saw) — attached server-side after the AI call, never
// by the model itself. For image/PDF-text files (no deterministic column
// structure to look up), this falls back to the model's own sampleValues —
// an honest v1 limitation, not a bug: vision extraction has no underlying
// grid to re-read from.
export type EnrichedMappingEntry = ImportMappingResult["mappings"][number] & { columnValues: string[] };
export type EnrichedMapping = Omit<ImportMappingResult, "mappings"> & { mappings: EnrichedMappingEntry[] };

export function enrichMapping(parsed: ParsedFile, mapping: ImportMappingResult): EnrichedMapping {
  if (parsed.kind !== "table") {
    return { ...mapping, mappings: mapping.mappings.map((m) => ({ ...m, columnValues: m.sampleValues })) };
  }

  // Only the first sheet's columns are matched against source_column names
  // — multi-sheet files are rare for the "one month of numbers" case this
  // targets, and the model is told which sheet it picked in its own prompt
  // context already.
  const sheet = parsed.sheets[0];
  const columnIndex = new Map(sheet?.headers.map((header, index) => [header.trim().toLowerCase(), index]) ?? []);

  return {
    ...mapping,
    mappings: mapping.mappings.map((entry) => {
      const index = columnIndex.get(entry.sourceColumn.trim().toLowerCase());
      const columnValues = index !== undefined ? (sheet?.rows.map((row) => row[index] ?? "") ?? []) : entry.sampleValues;
      return { ...entry, columnValues };
    }),
  };
}

// FR "1 234,56" / EN "1,234.56" — normalized in code, never by the model
// (CLAUDE.md: currency/format detection is code's job, not the LLM's).
export function parseLocaleNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/[€$£\s]/g, "");
  if (trimmed === "") return null;

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let normalized = trimmed;

  if (hasComma && hasDot) {
    // Whichever separator appears LAST is the decimal separator.
    normalized = trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed.replace(/,/g, "");
  } else if (hasComma) {
    // Single comma with exactly 2 trailing digits = decimal (FR); otherwise
    // a thousands separator.
    normalized = /,\d{1,2}$/.test(trimmed) ? trimmed.replace(",", ".") : trimmed.replace(/,/g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// Daily/weekly granularity sums across the period; monthly granularity is
// already a single whole-month figure (last non-empty value, never
// summed — summing 12 monthly totals into one would be wrong). Plain
// deterministic code, no AI involved — the model only ever identifies
// which column maps to which field and at what granularity.
export function aggregateColumnValues(columnValues: string[], granularity: "daily" | "weekly" | "monthly"): number {
  const numbers = columnValues.map(parseLocaleNumber).filter((n): n is number => n !== null);
  if (numbers.length === 0) return 0;
  if (granularity === "monthly") return numbers[numbers.length - 1];
  return numbers.reduce((sum, n) => sum + n, 0);
}
