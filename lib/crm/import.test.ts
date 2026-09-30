import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseImportFile } from "@/lib/import/parse";

import {
  duplicateGroups,
  mergePreparedRows,
  normalizeCrmDate,
  normalizeCrmPhone,
  prepareCrmSheet,
  reviewSheets,
  sheetNeedsDefaultSource,
} from "./import";
import type { CrmImportSheet } from "./import-schema";

const fixturePath = "/Users/cedricbernard/Downloads/KPI 2026.xlsx";
const fileHash = "a".repeat(64);

function sheet(overrides: Partial<CrmImportSheet> = {}): CrmImportSheet {
  return {
    fileName: "leads.xlsx",
    sheetName: "Leads",
    fileHash,
    headerRowConfident: true,
    previewRows: [],
    defaultSource: null,
    mapping: {
      sheetName: "Leads",
      targetTable: "crm_leads",
      ignoreReason: null,
      mappings: [],
      dateColumnName: null,
      dateColumnValues: null,
      periodDetected: null,
      unmappedColumns: [],
      questions: [],
    },
    ...overrides,
  };
}

describe("CRM import normalization", () => {
  it("normalizes local French phones to the same E.164 key", () => {
    expect(normalizeCrmPhone("06 12 34 56 78", "fr")).toEqual({ normalized: "+33612345678", reason: null });
    expect(normalizeCrmPhone("+33 6 12 34 56 78", "fr")).toEqual({ normalized: "+33612345678", reason: null });
    expect(normalizeCrmPhone("not a phone", "fr")).toEqual({ normalized: null, reason: "invalid" });
  });

  it("normalizes Excel serial and ISO dates without using import time", () => {
    expect(normalizeCrmDate("2026-01-15")).toBe("2026-01-15T00:00:00.000Z");
    expect(normalizeCrmDate("46037")).toBe("2026-01-15T00:00:00.000Z");
    expect(normalizeCrmDate("2026-02-30")).toBeNull();
    expect(normalizeCrmDate("")).toBeNull();
  });

  it("normalizes statuses from a WhatsApp/iClosed CRM export", async () => {
    const { normalizeCrmOutcome, normalizeCrmStage } = await import("./import");
    expect(normalizeCrmStage("Vidéo envoyée")).toBe("value_content_sent");
    expect(normalizeCrmStage("À vérifier")).toBe("conversation_in_progress");
    expect(normalizeCrmStage("À contacter")).toBe("first_message_sent");
    expect(normalizeCrmOutcome("Call annulé")).toBe("none");
    expect(normalizeCrmOutcome("Call booké")).toBe("none");
    expect(normalizeCrmOutcome("No Sale")).toBe("lost");
    expect(normalizeCrmOutcome("Follow-up planifié")).toBe("none");
  });
});

describe("CRM import row preparation", () => {
  it("keeps acquisition source separate from profile platform and asks for a sheet source when absent", () => {
    const prepared = prepareCrmSheet(sheet({
      mapping: {
        sheetName: "Leads",
        targetTable: "crm_leads",
        ignoreReason: null,
        mappings: [
          { sourceColumn: "Platform", targetField: "platform", confidence: "high", granularity: "daily", sampleValues: ["Instagram"], columnValues: ["Instagram"] },
          { sourceColumn: "Téléphone", targetField: "phone", confidence: "high", granularity: "daily", sampleValues: ["06 12 34 56 78"], columnValues: ["06 12 34 56 78"] },
          { sourceColumn: "Nom", targetField: "displayName", confidence: "high", granularity: "daily", sampleValues: ["Jane Doe"], columnValues: ["Jane Doe"] },
        ],
        dateColumnName: null,
        dateColumnValues: null,
        periodDetected: null,
        unmappedColumns: [],
        questions: [],
      },
    }), "fr");
    expect(prepared.rows[0]?.values.platform).toBe("instagram");
    expect(prepared.rows[0]?.values.source).toBeUndefined();
    expect(prepared.needsDefaultSource).toBe(true);
    expect(sheetNeedsDefaultSource(prepared.sheet)).toBe(true);
  });

  it("groups duplicate rows by normalized phone and merges the chosen value", () => {
    const prepared = prepareCrmSheet(sheet({
      mapping: {
        sheetName: "Leads",
        targetTable: "crm_leads",
        ignoreReason: null,
        mappings: [
          { sourceColumn: "Téléphone", targetField: "phone", confidence: "high", granularity: "daily", sampleValues: ["06 12 34 56 78"], columnValues: ["06 12 34 56 78", "+33 6 12 34 56 78"] },
          { sourceColumn: "Nom", targetField: "displayName", confidence: "high", granularity: "daily", sampleValues: ["Jane Doe"], columnValues: ["Jane Doe", "Jane D."] },
          { sourceColumn: "Source", targetField: "source", confidence: "high", granularity: "daily", sampleValues: ["Instagram"], columnValues: ["Instagram", "Instagram"] },
          { sourceColumn: "Créé le", targetField: "leadCreatedAt", confidence: "high", granularity: "daily", sampleValues: ["2026-01-01"], columnValues: ["2026-01-01", "2026-01-02"] },
        ],
        dateColumnName: null,
        dateColumnValues: null,
        periodDetected: null,
        unmappedColumns: [],
        questions: [],
      },
    }), "fr");
    const groups = duplicateGroups(prepared.rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.phoneNormalized).toBe("+33612345678");
    expect(groups[0]?.conflicts).toContain("displayName");
    const merged = mergePreparedRows(prepared.rows, { [String(groups[0]?.id) + ":displayName"]: "replace" }, groups[0]?.id ?? "");
    expect(merged.values.displayName).toBe("Jane D.");
  });

  it("keeps sheets Falco classified as ignored out of CRM preparation", () => {
    const ignored = sheet({
      mapping: {
        ...sheet().mapping,
        targetTable: "ignore",
        ignoreReason: "This sheet is not a lead list.",
        mappings: [{ sourceColumn: "Nom", targetField: "displayName", confidence: "high", granularity: "daily", sampleValues: ["Jane Doe"], columnValues: ["Jane Doe"] }],
      },
    });
    const reviewed = reviewSheets({
      sheets: [ignored],
      keySource: "shared",
      tokens: { inputTokens: 0, outputTokens: 0 },
      duplicateDecisions: {},
      existingLeadDecisions: {},
      conflictChoices: {},
      missingPhoneDecisions: {},
      missingDateDecisions: {},
    }, "fr");
    expect(reviewed).toHaveLength(0);
  });
});

const fixtureTest = existsSync(fixturePath) ? it : it.skip;

fixtureTest("parses the supplied KPI workbook without copying or writing it", async () => {
  const parsed = await parseImportFile("KPI 2026.xlsx", readFileSync(fixturePath));
  expect(parsed.kind).toBe("table");
  if (parsed.kind !== "table") return;
  expect(parsed.sheets.map((item) => item.name)).toEqual(
    expect.arrayContaining(["Setting", "Ads", "Suivi ads par ads", "Tracker réels instagram", "Tracker concurrents"]),
  );
  const setting = parsed.sheets.find((item) => item.name === "Setting");
  expect(setting?.headers.slice(0, 3)).toEqual(["Date", "Mois", "Nb nvx abonnés"]);
  expect(setting?.headerRowConfident).toBe(true);
  expect(setting?.rows.length).toBeGreaterThan(0);
});
