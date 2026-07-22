import ExcelJS from "exceljs";
import Papa from "papaparse";
import { PDFParse } from "pdf-parse";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_FILES_PER_IMPORT = 5;
export const MAX_ROWS_PER_FILE = 2000;
// How many leading rows to scan looking for the real header row — covers
// merged titles + a blank spacer row + the occasional subtitle line
// without scanning the whole sheet.
const HEADER_SCAN_WINDOW = 10;

export type RawSheet = {
  name: string;
  headers: string[];
  rows: string[][];
  // null when detectHeaderRow couldn't confidently identify a header row —
  // the sheet still parses (headers falls back to row 0), but the caller
  // must ask the user which line is really the header (see
  // components/import/import-clarify.tsx's "header row" question) rather
  // than silently trusting a guess.
  headerRowConfident: boolean;
  // The first few raw rows (before header detection), shown to the user
  // when headerRowConfident is false so they can point at the right one.
  previewRows: string[][];
};

export type ParsedFile =
  | { kind: "table"; fileName: string; sheets: RawSheet[] }
  | { kind: "text"; fileName: string; text: string }
  | { kind: "image"; fileName: string; base64: string; mediaType: string };

export class ImportParseError extends Error {}

// FR "1 234,56" / EN "1,234.56" — normalized in code, never by the model
// (CLAUDE.md: currency/format detection is code's job, not the LLM's).
// Lives here (not lib/import/aggregate.ts) because detectHeaderRow below
// also needs "does this cell look numeric" — the parser and the aggregator
// share this one interpretation of a raw cell string.
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

function looksLikeDateString(raw: string): boolean {
  const trimmed = raw.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ExcelJS never returns a formula cell's calculated value directly — it's
// an object ({formula, result} or {result, sharedFormula} for cells that
// share one formula). Unwrapping this is the #1 fix for the "every
// computed column becomes the literal string '[object Object]'" bug.
// An uncalculated formula (no `result` — the exporting tool never ran it)
// is treated as empty, same as a genuinely blank cell — never invented,
// never "[object Object]".
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined && value.result !== null) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ("text" in value && typeof value.text === "string") return value.text; // hyperlink / rich text
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    return ""; // uncalculated formula or unrecognized object shape — blank, not garbage
  }
  return String(value);
}

// Scans the first HEADER_SCAN_WINDOW rows for the real header row instead
// of always assuming row 0 — the #2 fix (a merged title row like "KPI
// TRACKER-FINANCE" repeated across every column was being read as headers).
// A candidate row must have ≥2 non-empty cells, ≥2 DISTINCT values (a
// repeated merged title fails this), and a majority of cells that are NOT
// number/date-like. It's confirmed only if the following row has a
// majority of number/date-like cells — that's what tells a title row
// ("KPI TRACKER-FINANCE" followed by more of the same) apart from a real
// header row (followed by actual data).
export function detectHeaderRow(rows: string[][]): number | null {
  const window = rows.slice(0, HEADER_SCAN_WINDOW);

  for (let i = 0; i < window.length - 1; i++) {
    const row = window[i];
    const nonEmpty = row.map((c) => c.trim()).filter((c) => c.length > 0);
    if (nonEmpty.length < 2) continue;
    if (new Set(nonEmpty).size < 2) continue; // repeated merged title

    const textCount = nonEmpty.filter((c) => parseLocaleNumber(c) === null && !looksLikeDateString(c)).length;
    if (textCount / nonEmpty.length < 0.6) continue;

    const nextRow = window[i + 1];
    const nextNonEmpty = nextRow.map((c) => c.trim()).filter((c) => c.length > 0);
    if (nextNonEmpty.length < 2) continue;
    const nextNumericCount = nextNonEmpty.filter((c) => parseLocaleNumber(c) !== null || looksLikeDateString(c)).length;
    if (nextNumericCount / nextNonEmpty.length >= 0.5) return i;
  }

  return null;
}

// `forcedHeaderIndex` is set when the user already answered "which line is
// your header row?" (components/import/import-clarify.tsx) for this exact
// sheet on a prior analyze call — skips detection entirely and trusts
// their answer, always confident.
function rowsToSheet(name: string, rawRows: string[][], forcedHeaderIndex?: number): RawSheet {
  const headerIndex = forcedHeaderIndex ?? detectHeaderRow(rawRows);
  const confident = forcedHeaderIndex !== undefined || headerIndex !== null;
  const effectiveIndex = headerIndex ?? 0;

  return {
    name,
    headers: rawRows[effectiveIndex] ?? [],
    rows: rawRows.slice(effectiveIndex + 1),
    headerRowConfident: confident,
    previewRows: rawRows.slice(0, 3),
  };
}

// ZIP (xlsx is a zip container), %PDF, PNG, JPEG magic bytes — sniffed
// BEFORE trusting the file extension, so a .csv renamed .xlsx (or the
// reverse) still parses as what it actually is.
function sniffKind(buffer: Buffer): "zip" | "pdf" | "png" | "jpeg" | null {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) return "zip";
  if (buffer.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  return null;
}

function parseCsv(fileName: string, text: string): ParsedFile {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  if (result.data.length > MAX_ROWS_PER_FILE) {
    throw new ImportParseError(
      `${fileName} : ${result.data.length} lignes, au-delà de la limite de ${MAX_ROWS_PER_FILE}. Filtre le fichier par période avant de réimporter.`
    );
  }
  if (result.data.length === 0) {
    throw new ImportParseError(
      `J'ai ouvert ${fileName} mais je n'y trouve pas de tableau de chiffres. Vérifie la feuille ou envoie une capture d'écran à la place.`
    );
  }
  return { kind: "table", fileName, sheets: [rowsToSheet(fileName, result.data)] };
}

async function parseExcel(fileName: string, buffer: Buffer, headerOverrides?: Record<string, number>): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ImportParseError("Je n'arrive pas à ouvrir ce fichier. Réessaie en l'exportant en .xlsx ou .csv depuis ton outil.");
  }

  const sheets: RawSheet[] = [];
  for (const worksheet of workbook.worksheets) {
    const rawRows: string[][] = [];
    worksheet.eachRow((row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1); // index 0 is always empty in ExcelJS
      rawRows.push(values.map(cellToString));
    });
    if (rawRows.length > MAX_ROWS_PER_FILE) {
      throw new ImportParseError(
        `${fileName} (feuille "${worksheet.name}") : ${rawRows.length} lignes, au-delà de la limite de ${MAX_ROWS_PER_FILE}. Filtre par période avant de réimporter.`
      );
    }
    if (rawRows.length === 0) continue; // a genuinely empty sheet is skipped, not an error for the whole file
    sheets.push(rowsToSheet(worksheet.name, rawRows, headerOverrides?.[worksheet.name]));
  }

  if (sheets.length === 0) {
    throw new ImportParseError(
      `J'ai ouvert ${fileName} mais je n'y trouve pas de tableau de chiffres. Vérifie la feuille ou envoie une capture d'écran à la place.`
    );
  }

  return { kind: "table", fileName, sheets };
}

async function parsePdf(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    if (text.trim().length === 0) {
      throw new ImportParseError(
        `J'ai ouvert ${fileName} mais je n'y trouve pas de tableau de chiffres. Vérifie la feuille ou envoie une capture d'écran à la place.`
      );
    }
    return { kind: "text", fileName, text };
  } catch (error) {
    if (error instanceof ImportParseError) throw error;
    throw new ImportParseError("Je n'arrive pas à ouvrir ce fichier. Réessaie en l'exportant en .xlsx ou .csv depuis ton outil.");
  } finally {
    await parser.destroy();
  }
}

// Deterministic, code-only parsing — no AI involved here (the mapping step
// in lib/agent/import-mapping.ts is the only place the model is called).
// Never writes the file anywhere: the buffer lives only for the duration of
// this call, and only the derived structure below is ever returned.
export async function parseImportFile(fileName: string, buffer: Buffer, headerOverrides?: Record<string, number>): Promise<ParsedFile> {
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new ImportParseError(`${fileName} dépasse la limite de 10 Mo.`);
  }

  const sniffed = sniffKind(buffer);

  if (sniffed === "zip") return parseExcel(fileName, buffer, headerOverrides);
  if (sniffed === "pdf") return parsePdf(fileName, buffer);
  if (sniffed === "png") return { kind: "image", fileName, base64: buffer.toString("base64"), mediaType: "image/png" };
  if (sniffed === "jpeg") return { kind: "image", fileName, base64: buffer.toString("base64"), mediaType: "image/jpeg" };

  // No recognized binary signature — treat as text/CSV regardless of
  // extension: content wins over the file name in both directions (a
  // misnamed .xlsx that's actually a .csv still parses as CSV; a
  // genuinely corrupted binary falls through to parseCsv's own
  // no-data-found check rather than a wrong "unsupported format" claim).
  return parseCsv(fileName, buffer.toString("utf8"));
}
