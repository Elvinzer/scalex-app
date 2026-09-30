import { describe, expect, it } from "vitest";

import { applyImportTargetHint } from "./import-mapping";
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
