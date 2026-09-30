import { describe, expect, it } from "vitest";

import { CRM_DEFAULT_LEAD_LIMIT, CRM_PIPELINE_LEAD_LIMIT, normalizeCrmLeadLimit } from "./lead-pagination";

describe("CRM lead query limits", () => {
  it("keeps the list default at 100 and allows the Pipeline working set", () => {
    expect(normalizeCrmLeadLimit()).toBe(CRM_DEFAULT_LEAD_LIMIT);
    expect(normalizeCrmLeadLimit(CRM_PIPELINE_LEAD_LIMIT)).toBe(500);
  });

  it("clamps unsafe limits to the supported range", () => {
    expect(normalizeCrmLeadLimit(0)).toBe(1);
    expect(normalizeCrmLeadLimit(10_000)).toBe(CRM_PIPELINE_LEAD_LIMIT);
  });
});
