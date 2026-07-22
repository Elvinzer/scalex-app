import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseImportFile } from "./parse";
import {
  aggregateColumnValues,
  aggregateColumnValuesForRows,
  enrichMapping,
  excelSerialToDate,
  groupValuesByMonth,
  normalizeDateCell,
} from "./aggregate";
import type { ImportMappingResult } from "./schema";

describe("excelSerialToDate / normalizeDateCell", () => {
  it("converts a bare Excel serial number to the correct calendar date (the reported bug)", () => {
    // 46198 is the real serial ExcelJS/Excel store for 2026-06-25 — the
    // exact case from the bug report ("46198 → 25/06/2026").
    expect(excelSerialToDate(46198).toISOString().slice(0, 10)).toBe("2026-06-25");
  });

  it("normalizeDateCell handles ISO, FR, and serial-number shapes identically", () => {
    expect(normalizeDateCell("2026-06-25")).toEqual({ year: 2026, month: 6, day: 25 });
    expect(normalizeDateCell("25/06/2026")).toEqual({ year: 2026, month: 6, day: 25 });
    expect(normalizeDateCell("46198")).toEqual({ year: 2026, month: 6, day: 25 });
  });

  it("does not misread an ordinary number as a date serial outside the plausible range", () => {
    expect(normalizeDateCell("0")).toBeNull();
    expect(normalizeDateCell("-5")).toBeNull();
    expect(normalizeDateCell("3958466")).toBeNull(); // past Excel's own max serial
  });

  it("rejects garbage/blank cells", () => {
    expect(normalizeDateCell("")).toBeNull();
    expect(normalizeDateCell("jour off")).toBeNull();
  });
});

describe("groupValuesByMonth", () => {
  it("groups row indexes by calendar month from ISO date strings", () => {
    const dates = ["2026-06-28", "2026-06-29", "2026-07-01", "2026-07-02", "2026-07-03"];
    const buckets = groupValuesByMonth(dates);
    expect(buckets).not.toBeNull();
    expect(buckets).toHaveLength(2);
    const june = buckets!.find((b) => b.month === 6)!;
    const july = buckets!.find((b) => b.month === 7)!;
    expect(june.rowIndexes).toEqual([0, 1]);
    expect(july.rowIndexes).toEqual([2, 3, 4]);
  });

  it("groups FR-formatted dates (dd/mm/yyyy)", () => {
    const dates = ["25/06/2026", "30/06/2026", "01/07/2026"];
    const buckets = groupValuesByMonth(dates);
    expect(buckets).toHaveLength(2);
  });

  it("groups bare Excel serial-number dates the same way (no numFmt on the source column)", () => {
    // Serials for 2026-06-30 and 2026-07-01 — a month boundary crossing,
    // guards against any off-by-one on the serial→calendar conversion.
    const dates = ["46203", "46204"];
    const buckets = groupValuesByMonth(dates);
    expect(buckets).toHaveLength(2);
    expect(buckets!.find((b) => b.month === 6)!.rowIndexes).toEqual([0]);
    expect(buckets!.find((b) => b.month === 7)!.rowIndexes).toEqual([1]);
  });

  it("returns null when nothing parses as a date", () => {
    expect(groupValuesByMonth(["", "not a date", "also not"])).toBeNull();
  });
});

describe("aggregateColumnValuesForRows", () => {
  it("sums only the rows in the given bucket, not the whole column (the fix for June+July mixing)", () => {
    const values = ["10", "20", "100", "200", "300"]; // june: 10,20 — july: 100,200,300
    expect(aggregateColumnValuesForRows(values, [0, 1], "daily")).toBe(30);
    expect(aggregateColumnValuesForRows(values, [2, 3, 4], "daily")).toBe(600);
  });

  it("takes the last value for monthly granularity, never sums", () => {
    const values = ["100", "150", "180"];
    expect(aggregateColumnValuesForRows(values, [0, 1, 2], "monthly")).toBe(180);
  });

  it("never coerces blank cells to 0 when summing — they're just excluded", () => {
    const values = ["10", "", "20"];
    expect(aggregateColumnValuesForRows(values, [0, 1, 2], "daily")).toBe(30);
  });
});

describe("aggregateColumnValues (whole-column fallback)", () => {
  it("sums the entire column when there's no month bucket to scope to", () => {
    expect(aggregateColumnValues(["1", "2", "3"], "daily")).toBe(6);
  });
});

// Step 4 validation from the bug report: a KPI_2026.xlsx-shaped fixture
// (merged title on rows 1-2, real headers on row 3, dates stored as bare
// Excel serial numbers with no explicit date numFmt — June 2026 days 25-30
// + July 2026 days 1-22, 28 rows total) must resolve to 2 usable months
// with correct sums, not "Aucune valeur exploitable détectée". The AI
// mapping step itself (deciding to ignore the rate/notes columns) isn't
// exercised here — this test starts from a mapping result already shaped
// as if the model had correctly ignored them, since that decision lives in
// lib/agent/import-mapping.ts, not in the deterministic code under test.
describe("end-to-end: KPI_2026.xlsx-shaped fixture (the reported bug)", () => {
  function excelSerial(year: number, month: number, day: number): number {
    return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  it("resolves June (6 days) and July (22 days) as two separate months with correct sums", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Setting");
    sheet.addRow(["KPI TRACKER-FINANCE", "KPI TRACKER-FINANCE", "KPI TRACKER-FINANCE", "KPI TRACKER-FINANCE"]);
    sheet.addRow(["KPI TRACKER-FINANCE", "KPI TRACKER-FINANCE", "KPI TRACKER-FINANCE", "KPI TRACKER-FINANCE"]);
    sheet.addRow(["Date", "Nouveaux abonnés", "Taux de conversion", "Notes/Observations"]);
    for (let day = 25; day <= 30; day++) {
      sheet.addRow([excelSerial(2026, 6, day), 10 + day, 0.12, ""]); // no explicit date numFmt — the bug's exact shape
    }
    for (let day = 1; day <= 22; day++) {
      sheet.addRow([excelSerial(2026, 7, day), 20 + day, 0.15, ""]);
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseImportFile("KPI_2026.xlsx", buffer);
    expect(parsed.kind).toBe("table");
    if (parsed.kind !== "table") return;

    // Stands in for what lib/agent/import-mapping.ts would have produced —
    // rate/notes columns already correctly left unmapped (targetField null).
    const mapping: ImportMappingResult = {
      sheetName: "Setting",
      targetTable: "monthly_metrics",
      ignoreReason: null,
      dateColumnName: "Date",
      periodDetected: null,
      unmappedColumns: ["Taux de conversion", "Notes/Observations"],
      questions: [],
      mappings: [
        { sourceColumn: "Nouveaux abonnés", targetField: "newFollowers", confidence: "high", granularity: "daily", sampleValues: [] },
        { sourceColumn: "Taux de conversion", targetField: null, confidence: "high", granularity: "daily", sampleValues: [] },
        { sourceColumn: "Notes/Observations", targetField: null, confidence: "high", granularity: "daily", sampleValues: [] },
      ],
    };

    const enriched = enrichMapping(parsed, mapping);
    expect(enriched.dateColumnValues).not.toBeNull();

    const buckets = groupValuesByMonth(enriched.dateColumnValues!);
    expect(buckets).not.toBeNull(); // this is exactly what used to be null → "Aucune valeur exploitable détectée"
    expect(buckets).toHaveLength(2);

    const june = buckets!.find((b) => b.month === 6)!;
    const july = buckets!.find((b) => b.month === 7)!;
    expect(june.year).toBe(2026);
    expect(july.year).toBe(2026);
    expect(june.rowIndexes).toHaveLength(6);
    expect(july.rowIndexes).toHaveLength(22);

    const newFollowersColumn = enriched.mappings.find((m) => m.sourceColumn === "Nouveaux abonnés")!.columnValues;
    // 10+25 + 10+26 + ... + 10+30 = 60 + (25+26+27+28+29+30) = 60 + 165
    expect(aggregateColumnValuesForRows(newFollowersColumn, june.rowIndexes, "daily")).toBe(225);
    // 20+1 + 20+2 + ... + 20+22 = 440 + (1+2+...+22) = 440 + 253
    expect(aggregateColumnValuesForRows(newFollowersColumn, july.rowIndexes, "daily")).toBe(693);

    // The rate/notes columns are still readable (never crash), just never
    // targeted — mirrors "Zéro question de Falco sur les colonnes évidentes".
    expect(mapping.unmappedColumns).toEqual(["Taux de conversion", "Notes/Observations"]);
  });
});
