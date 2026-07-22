import ExcelJS from "exceljs";
import Papa from "papaparse";
import { PDFParse } from "pdf-parse";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_FILES_PER_IMPORT = 5;
export const MAX_ROWS_PER_FILE = 2000;

export type RawSheet = { name: string; headers: string[]; rows: string[][] };

export type ParsedFile =
  | { kind: "table"; fileName: string; sheets: RawSheet[] }
  | { kind: "text"; fileName: string; text: string }
  | { kind: "image"; fileName: string; base64: string; mediaType: string };

export class ImportParseError extends Error {}

function rowsToSheet(name: string, rows: string[][]): RawSheet {
  const [headers, ...body] = rows;
  return { name, headers: headers ?? [], rows: body };
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
  return { kind: "table", fileName, sheets: [rowsToSheet(fileName, result.data)] };
}

async function parseExcel(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: RawSheet[] = workbook.worksheets.map((worksheet) => {
    const rows: string[][] = [];
    worksheet.eachRow((row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1); // index 0 is always empty in ExcelJS
      rows.push(values.map((v) => (v === null || v === undefined ? "" : String(v))));
    });
    if (rows.length > MAX_ROWS_PER_FILE) {
      throw new ImportParseError(
        `${fileName} (feuille "${worksheet.name}") : ${rows.length} lignes, au-delà de la limite de ${MAX_ROWS_PER_FILE}. Filtre par période avant de réimporter.`
      );
    }
    return rowsToSheet(worksheet.name, rows);
  });

  return { kind: "table", fileName, sheets };
}

async function parsePdf(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    return { kind: "text", fileName, text };
  } finally {
    await parser.destroy();
  }
}

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

// Deterministic, code-only parsing — no AI involved here (the mapping step
// in lib/agent/import-mapping.ts is the only place the model is called).
// Never writes the file anywhere: the buffer lives only for the duration of
// this call, and only the derived structure below is ever returned.
export async function parseImportFile(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new ImportParseError(`${fileName} dépasse la limite de 10 Mo.`);
  }

  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "csv" || extension === "tsv") {
    return parseCsv(fileName, buffer.toString("utf8"));
  }
  if (extension === "xlsx" || extension === "xls") {
    return parseExcel(fileName, buffer);
  }
  if (extension === "pdf") {
    return parsePdf(fileName, buffer);
  }
  if (extension in IMAGE_MEDIA_TYPES) {
    return { kind: "image", fileName, base64: buffer.toString("base64"), mediaType: IMAGE_MEDIA_TYPES[extension] };
  }

  throw new ImportParseError(`Format non supporté : .${extension || "?"}. Formats acceptés : CSV, TSV, Excel, PDF, PNG, JPG.`);
}
