import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestFalcoJson: vi.fn() }));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/agent/falco-provider", () => ({ requestFalcoJson: mocks.requestFalcoJson }));

import { applyImportTargetHint, mapImportedFile } from "./import-mapping";
import type { ImportMappingResult } from "@/lib/import/schema";

function result(targetTable: ImportMappingResult["targetTable"], ignoreReason: string | null = null): ImportMappingResult {
  return {
    sheetName: "Setting",
    targetTable,
    ignoreReason,
    mappings: [],
    dateColumnName: null,
    periodDetected: null,
    unmappedColumns: [],
    questions: [],
  };
}

describe("applyImportTargetHint", () => {
  it("keeps CRM sheets as CRM sheets", () => {
    expect(applyImportTargetHint(result("crm_leads"), { targetTableHint: "crm_leads" }).targetTable).toBe("crm_leads");
  });

  it("does not force KPI or sales sheets into the CRM", () => {
    const constrained = applyImportTargetHint(result("monthly_metrics"), {
      targetTableHint: "crm_leads",
      crmIgnoreReason: "hors périmètre CRM",
    });

    expect(constrained.targetTable).toBe("ignore");
    expect(constrained.ignoreReason).toBe("hors périmètre CRM");
  });

  it("preserves a reason already returned for an ignored sheet", () => {
    const constrained = applyImportTargetHint(result("ignore", "contenu social"), {
      targetTableHint: "crm_leads",
      crmIgnoreReason: "hors périmètre CRM",
    });

    expect(constrained.ignoreReason).toBe("contenu social");
  });
});

describe("mapImportedFile with the Falco/Groq provider", () => {
  it("accepts the OpenAI-compatible JSON response used by Groq", async () => {
    mocks.requestFalcoJson.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  targetTable: "crm_leads",
                  mappings: [{ sourceColumn: "Nom", targetField: "displayName", confidence: "high", granularity: "daily", sampleValues: ["Jane Doe"] }],
                  unmappedColumns: [],
                  questions: [],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const mapped = await mapImportedFile(
      {
        kind: "sheet",
        fileName: "leads.xlsx",
        sheet: {
          name: "Leads",
          headers: ["Nom"],
          rows: [["Jane Doe"]],
          headerRowConfident: true,
          previewRows: [["Nom"], ["Jane Doe"]],
        },
      },
      "Business de test",
      { kind: "groq", apiKey: "test-key-not-secret", baseURL: "https://example.test", model: "test-model" },
      { targetTableHint: "crm_leads", crmIgnoreReason: "hors périmètre CRM" },
    );

    expect(mapped.result.targetTable).toBe("crm_leads");
    expect(mapped.result.mappings[0]?.targetField).toBe("displayName");
    expect(mapped.inputTokens).toBe(12);
    expect(mapped.outputTokens).toBe(8);
    expect(mocks.requestFalcoJson).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "groq", model: "test-model" }),
      expect.stringContaining("objet JSON valide"),
      expect.stringContaining('Feuille "Leads"'),
      0,
      8000,
    );
  });
});
