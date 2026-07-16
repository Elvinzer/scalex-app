import { settingKpiEntryInputSchema, type SettingKpiEntryInput } from "./schema";

const EXPECTED_COLUMNS = 6;
const MAX_ROWS = 1000;

export type SettingKpiCsvError = { line: number; message: string };

export type SettingKpiCsvResult = {
  rows: SettingKpiEntryInput[];
  errors: SettingKpiCsvError[];
};

// Template has no quoted/escaped fields (dates and integers only), so a
// plain split is enough — no need for a CSV parsing library.
export function parseSettingKpiCsv(raw: string): SettingKpiCsvResult {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const errors: SettingKpiCsvError[] = [];
  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: "Le fichier est vide" }] };
  }

  const dataLines = /^date\s*,/i.test(lines[0]) ? lines.slice(1) : lines;
  const headerOffset = dataLines.length === lines.length ? 0 : 1;

  if (dataLines.length > MAX_ROWS) {
    errors.push({
      line: 0,
      message: `Trop de lignes (max ${MAX_ROWS}) — sépare l'import en plusieurs fichiers`,
    });
    return { rows: [], errors };
  }

  // Last occurrence of a given date wins, matching the upsert semantics of
  // the manual form and the DB's own unique (userId, date) index.
  const byDate = new Map<string, SettingKpiEntryInput>();

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

    const [date, newSubscribers, firstMessagesSent, conversationsStarted, callsProposed, callsBooked] =
      fields;

    const numericFields = {
      newSubscribers,
      firstMessagesSent,
      conversationsStarted,
      callsProposed,
      callsBooked,
    };
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

    const parsed = settingKpiEntryInputSchema.safeParse({ date, ...parsedNumbers });
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
