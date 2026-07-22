import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { detectHeaderRow, ImportParseError, parseImportFile, parseLocaleNumber } from "./parse";

// Fixtures are built in code with ExcelJS, never committed as binary
// .xlsx files — mirrors the structural challenges found in the real test
// file (KPI 2026.xlsx) without shipping anyone's personal spreadsheet.
async function buildXlsx(sheets: Record<string, unknown[][]>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("detectHeaderRow", () => {
  it("finds the header on row 0 (simple case)", () => {
    const rows = [
      ["Date", "Ventes"],
      ["2026-06-01", "3"],
      ["2026-06-02", "5"],
    ];
    expect(detectHeaderRow(rows)).toBe(0);
  });

  it("skips a merged title row repeated across every column (row 3 case, the real bug)", () => {
    const rows = [
      ["KPI TRACKER", "KPI TRACKER", "KPI TRACKER"],
      ["KPI TRACKER", "KPI TRACKER", "KPI TRACKER"],
      ["Date", "Nouveaux abonnés", "Ventes"],
      ["2026-06-01", "12", "1"],
      ["2026-06-02", "8", "0"],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
  });

  it("finds a header on row 5 preceded by blank/subtitle rows", () => {
    const rows = [
      ["TRACKER 2026"],
      [""],
      ["Notes internes"],
      [""],
      ["Date", "Ventes"],
      ["2026-06-01", "3"],
    ];
    expect(detectHeaderRow(rows)).toBe(4);
  });

  it("returns null when nothing in the scan window looks like a header", () => {
    const rows = [
      ["KPI TRACKER"],
      ["KPI TRACKER"],
      ["KPI TRACKER"],
    ];
    expect(detectHeaderRow(rows)).toBeNull();
  });
});

describe("parseLocaleNumber", () => {
  it("parses FR-formatted numbers (1 234,56)", () => {
    expect(parseLocaleNumber("1 234,56")).toBeCloseTo(1234.56);
  });
  it("parses EN-formatted numbers (1,234.56)", () => {
    expect(parseLocaleNumber("1,234.56")).toBeCloseTo(1234.56);
  });
  it("returns null for empty/non-numeric strings", () => {
    expect(parseLocaleNumber("")).toBeNull();
    expect(parseLocaleNumber("jour off déménagement")).toBeNull();
  });
});

describe("parseImportFile — Excel", () => {
  it("extracts formula RESULTS, never '[object Object]'", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Setting");
    sheet.addRow(["Date", "Ventes", "Taux"]);
    sheet.addRow(["2026-06-01", 5, { formula: "B2/10", result: 0.5 }]);
    sheet.addRow(["2026-06-02", 3, { formula: "B3/10" }]); // uncalculated — no result
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseImportFile("test.xlsx", buffer);
    expect(parsed.kind).toBe("table");
    if (parsed.kind !== "table") return;
    const [firstSheet] = parsed.sheets;
    expect(firstSheet.rows.some((row) => row.some((cell) => cell.includes("object Object")))).toBe(false);
    expect(firstSheet.rows[0]).toEqual(["2026-06-01", "5", "0.5"]);
    expect(firstSheet.rows[1][2]).toBe(""); // uncalculated formula → empty, never invented
  });

  it("formats real Date cells as ISO, not verbose Date.toString()", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Setting");
    sheet.addRow(["Date", "Ventes"]);
    sheet.addRow([new Date(Date.UTC(2026, 5, 25)), 3]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseImportFile("test.xlsx", buffer);
    if (parsed.kind !== "table") throw new Error("expected table");
    expect(parsed.sheets[0].rows[0][0]).toBe("2026-06-25");
  });

  it("detects the real header row and ignores a repeated merged title", async () => {
    const buffer = await buildXlsx({
      Setting: [
        ["KPI TRACKER-FINANCE", "KPI TRACKER-FINANCE"],
        ["KPI TRACKER-FINANCE", "KPI TRACKER-FINANCE"],
        ["Date", "Nb nvx abonnés"],
        ["2026-06-25", 86],
        ["2026-06-26", 52],
      ],
    });

    const parsed = await parseImportFile("test.xlsx", buffer);
    if (parsed.kind !== "table") throw new Error("expected table");
    expect(parsed.sheets[0].headers).toEqual(["Date", "Nb nvx abonnés"]);
    expect(parsed.sheets[0].headerRowConfident).toBe(true);
    expect(parsed.sheets[0].rows).toHaveLength(2);
  });

  it("flags headerRowConfident=false when no row qualifies", async () => {
    const buffer = await buildXlsx({ Sheet1: [["KPI TRACKER"], ["KPI TRACKER"], ["KPI TRACKER"]] });
    const parsed = await parseImportFile("test.xlsx", buffer);
    if (parsed.kind !== "table") throw new Error("expected table");
    expect(parsed.sheets[0].headerRowConfident).toBe(false);
  });

  it("respects a forced header override", async () => {
    const buffer = await buildXlsx({
      Setting: [["Title"], ["Title"], ["Date", "Ventes"], ["2026-06-01", "3"]],
    });
    const parsed = await parseImportFile("test.xlsx", buffer, { Setting: 2 });
    if (parsed.kind !== "table") throw new Error("expected table");
    expect(parsed.sheets[0].headers).toEqual(["Date", "Ventes"]);
    expect(parsed.sheets[0].headerRowConfident).toBe(true);
  });

  it("skips a genuinely empty sheet without failing the whole file", async () => {
    const buffer = await buildXlsx({
      Empty: [],
      Setting: [["Date", "Ventes"], ["2026-06-01", "3"]],
    });
    const parsed = await parseImportFile("test.xlsx", buffer);
    if (parsed.kind !== "table") throw new Error("expected table");
    expect(parsed.sheets.map((s) => s.name)).toEqual(["Setting"]);
  });

  it("throws a specific error when the whole file has no data at all", async () => {
    const buffer = await buildXlsx({ Empty: [] });
    await expect(parseImportFile("test.xlsx", buffer)).rejects.toThrow(ImportParseError);
    await expect(parseImportFile("test.xlsx", buffer)).rejects.toThrow(/pas de tableau de chiffres/);
  });
});

describe("parseImportFile — content sniffing", () => {
  it("parses a .csv renamed .xlsx as CSV (content wins over extension)", async () => {
    const buffer = Buffer.from("Date,Ventes\n2026-06-01,3\n2026-06-02,5\n", "utf8");
    const parsed = await parseImportFile("export.xlsx", buffer);
    expect(parsed.kind).toBe("table");
    if (parsed.kind !== "table") return;
    expect(parsed.sheets[0].headers).toEqual(["Date", "Ventes"]);
  });

  it("parses a real .xlsx even if misnamed .csv", async () => {
    const buffer = await buildXlsx({ Setting: [["Date", "Ventes"], ["2026-06-01", "3"]] });
    const parsed = await parseImportFile("export.csv", buffer);
    expect(parsed.kind).toBe("table");
    if (parsed.kind !== "table") return;
    expect(parsed.sheets[0].headers).toEqual(["Date", "Ventes"]);
  });

  it("throws a clear message for a corrupted/illegible file", async () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]); // ZIP magic bytes, garbage body
    await expect(parseImportFile("broken.xlsx", buffer)).rejects.toThrow(/Je n'arrive pas à ouvrir ce fichier/);
  });
});
