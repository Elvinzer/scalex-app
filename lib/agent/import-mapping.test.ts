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

  it("repairs common CRM export mappings before rows are prepared", async () => {
    mocks.requestFalcoJson.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  targetTable: "crm_leads",
                  mappings: [
                    { sourceColumn: "Suivi", targetField: "qualificationNote", confidence: "low", granularity: "daily", sampleValues: ["Vidéo envoyée", "À vérifier"] },
                    { sourceColumn: "Commentaire", targetField: "qualificationNote", confidence: "low", granularity: "daily", sampleValues: ["Opéré, perte MT5"] },
                    { sourceColumn: "Prénom", targetField: "firstName", confidence: "high", granularity: "daily", sampleValues: ["Alexandre", "Tony"] },
                    { sourceColumn: "Nom", targetField: "lastName", confidence: "high", granularity: "daily", sampleValues: ["Mepuis", "Sastre"] },
                    { sourceColumn: "Téléphone", targetField: "phone", confidence: "high", granularity: "daily", sampleValues: ["+33687880310", "+33695475399"] },
                    { sourceColumn: "WhatsApp", targetField: "profileUrl", confidence: "medium", granularity: "daily", sampleValues: ["https://wa.me/33687880310"] },
                    { sourceColumn: "Premier message WhatsApp", targetField: "messageOccurredAt", confidence: "low", granularity: "daily", sampleValues: ["Hello Alexandre"] },
                    { sourceColumn: "Action maintenant", targetField: "qualificationNote", confidence: "low", granularity: "daily", sampleValues: ["Répondre / qualifier"] },
                    { sourceColumn: "Segment iClosed", targetField: "outcome", confidence: "medium", granularity: "daily", sampleValues: ["Call annulé", "No Sale"] },
                    { sourceColumn: "Dernière MAJ", targetField: "leadCreatedAt", confidence: "low", granularity: "daily", sampleValues: ["2026-01-29", "2025-12-04"] },
                    { sourceColumn: "Dernière interaction", targetField: "stage", confidence: "medium", granularity: "daily", sampleValues: ["Call cancelled", "Strategy call booked"] },
                    { sourceColumn: "Email / Contact", targetField: "email", confidence: "high", granularity: "daily", sampleValues: ["alex@example.com", "tony@example.com"] },
                  ],
                  unmappedColumns: [],
                  questions: [],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 32, completion_tokens: 24 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const mapped = await mapImportedFile(
      {
        kind: "sheet",
        fileName: "cvf.xlsx",
        sheet: {
          name: "ACTION",
          headers: ["Suivi", "Commentaire", "Prénom", "Nom", "Téléphone", "WhatsApp", "Premier message WhatsApp", "Action maintenant", "Segment iClosed", "Dernière MAJ", "Dernière interaction", "Email / Contact"],
          rows: [
            ["Vidéo envoyée", "", "Alexandre", "Mepuis", "+33687880310", "https://wa.me/33687880310", "Hello Alexandre", "Répondre / qualifier", "Call annulé", "2026-01-29", "Call cancelled", "alex@example.com"],
            ["À vérifier", "Opéré, perte MT5", "Tony", "Sastre", "+33695475399", "https://wa.me/33695475399", "", "Répondre / qualifier", "No Sale", "2025-12-04", "Strategy call booked", "tony@example.com"],
          ],
          headerRowConfident: true,
          previewRows: [],
        },
      },
      "Business de test",
      { kind: "groq", apiKey: "test-key-not-secret", baseURL: "https://example.test", model: "test-model" },
      { targetTableHint: "crm_leads", crmIgnoreReason: "hors périmètre CRM" },
    );

    const targetFor = (sourceColumn: string) => mapped.result.mappings.find((entry) => entry.sourceColumn === sourceColumn)?.targetField;
    expect(mapped.result.targetTable).toBe("crm_leads");
    expect(targetFor("Suivi")).toBe("stage");
    expect(targetFor("Commentaire")).toBe("qualificationNote");
    expect(targetFor("Action maintenant")).toBeNull();
    expect(targetFor("WhatsApp")).toBeNull();
    expect(targetFor("Premier message WhatsApp")).toBeNull();
    expect(targetFor("Segment iClosed")).toBe("outcome");
    expect(targetFor("Dernière MAJ")).toBe("leadCreatedAt");
    expect(targetFor("Dernière interaction")).toBeNull();
    expect(targetFor("Téléphone")).toBe("phone");
    expect(targetFor("Email / Contact")).toBe("email");
  });

  it("recovers a pasted CRM table with profile URLs when Falco says to ignore it", async () => {
    mocks.requestFalcoJson.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  targetTable: "ignore",
                  ignoreReason: "Pas de téléphone détecté",
                  mappings: [],
                  unmappedColumns: [],
                  questions: [],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 6 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const mapped = await mapImportedFile(
      {
        kind: "sheet",
        fileName: "tableau-colle.tsv",
        sheet: {
          name: "tableau-colle.tsv",
          headers: ["Date", "Nom", "Url profil", "Statut", "Ressource envoyés", "Commentaire"],
          rows: [
            ["01/10/2026", "Laurent B", "https://www.instagram.com/laurentb/", "VA envoyé", "ETF", ""],
            ["01/10/2026", "Stephen", "https://www.instagram.com/zorba1502/", "1er message envoyé", "ETF", ""],
          ],
          headerRowConfident: true,
          previewRows: [],
        },
      },
      "Business de test",
      { kind: "groq", apiKey: "test-key-not-secret", baseURL: "https://example.test", model: "test-model" },
      { targetTableHint: "crm_leads", crmIgnoreReason: "hors périmètre CRM" },
    );

    const targetFor = (sourceColumn: string) => mapped.result.mappings.find((entry) => entry.sourceColumn === sourceColumn)?.targetField;
    expect(mapped.result.targetTable).toBe("crm_leads");
    expect(targetFor("Date")).toBe("leadCreatedAt");
    expect(targetFor("Nom")).toBe("displayName");
    expect(targetFor("Url profil")).toBe("profileUrl");
    expect(targetFor("Statut")).toBe("stage");
    expect(targetFor("Ressource envoyés")).toBeUndefined();
  });
});
