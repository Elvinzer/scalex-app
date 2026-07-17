import { closingKpiEntryInputSchema, type ClosingKpiEntryInput } from "./schema";

const EXPECTED_COLUMNS = 3;
const MAX_ROWS = 1000;

export type ClosingKpiCsvError = { line: number; message: string };

export type ClosingKpiCsvResult = {
  rows: ClosingKpiEntryInput[];
  errors: ClosingKpiCsvError[];
};

// Same approach as lib/setting/csv.ts: no quoted/escaped fields (dates and
// integers only), so a plain split is enough — no CSV parsing library.
export function parseClosingKpiCsv(raw: string): ClosingKpiCsvResult {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const errors: ClosingKpiCsvError[] = [];
  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: "Le fichier est vide" }] };
  }

  const dataLines = /^date\s*,/i.test(lines[0]) ? lines.slice(1) : lines;
  const headerOffset = dataLines.length === lines.length ? 0 : 1;

  if (dataLines.length > MAX_ROWS) {
    errors.push({
      line: 0,
      message: `Trop de lignes (max ${MAX_ROWS}) : sépare l'import en plusieurs fichiers`,
    });
    return { rows: [], errors };
  }

  // Last occurrence of a given date wins, matching the upsert semantics of
  // the manual form and the DB's own unique (userId, date) index.
  const byDate = new Map<string, ClosingKpiEntryInput>();

  dataLines.forEach((line, index) => {
    const lineNumber = index + 1 + headerOffset;
    const fields = line.split(",").map((field) => field.trim());

    if (fields.length !== EXPECTED_COLUMNS) {
      errors.push({
        line: lineNumber,
        message: `${EXPECTED_COLUMNS} colonnes attendues, ${fields.length} trouvées`,
      });
      return;
    }

    const [date, callsAttended, salesClosed] = fields;

    const numericFields = { callsAttended, salesClosed };
    const parsedNumbers: Record<string, number> = {};
    let hasNumberError = false;
    for (const [key, value] of Object.entries(numericFields)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        errors.push({ line: lineNumber, message: `"${key}" n'est pas un nombre valide` });
        hasNumberError = true;
        break;
      }
      parsedNumbers[key] = parsed;
    }
    if (hasNumberError) return;

    const parsed = closingKpiEntryInputSchema.safeParse({ date, ...parsedNumbers });
    if (!parsed.success) {
      errors.push({
        line: lineNumber,
        message: parsed.error.issues[0]?.message ?? "Ligne invalide",
      });
      return;
    }

    byDate.set(parsed.data.date, parsed.data);
  });

  return { rows: Array.from(byDate.values()), errors };
}
