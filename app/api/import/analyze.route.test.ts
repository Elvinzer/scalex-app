import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireCrmAccess: vi.fn(),
  requirePermission: vi.fn(),
  mapImportedFile: vi.fn(),
  resolveAgentKey: vi.fn(),
  getBusinessProfile: vi.fn(),
  isRateLimited: vi.fn(() => false),
  getRequestLocale: vi.fn(async () => "fr"),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/crm/access", () => ({ requireCrmAccess: mocks.requireCrmAccess }));
vi.mock("@/lib/team/context", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/agent/import-mapping", () => ({ mapImportedFile: mocks.mapImportedFile }));
vi.mock("@/lib/agent/client", () => ({ resolveAgentKey: mocks.resolveAgentKey }));
vi.mock("@/lib/business/queries", () => ({ getBusinessProfile: mocks.getBusinessProfile }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: mocks.isRateLimited }));
vi.mock("@/lib/i18n/locale", () => ({ getRequestLocale: mocks.getRequestLocale }));
vi.mock("@/lib/import/parse", () => ({
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_FILES_PER_IMPORT: 5,
  MAX_ROWS_PER_FILE: 2000,
  ImportParseError: class ImportParseError extends Error {},
  parseImportFile: vi.fn(),
}));
vi.mock("@/lib/import/aggregate", () => ({ enrichMapping: vi.fn(), groupValuesByMonth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({ monthlyMetrics: {}, users: {} }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { POST } from "./analyze/route";

function configureSession(claims: unknown): void {
  mocks.createClient.mockResolvedValue({ auth: { getClaims: vi.fn(async () => ({ data: { claims } })) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  configureSession({ sub: "user-id" });
  mocks.requireCrmAccess.mockResolvedValue(null);
  mocks.requirePermission.mockResolvedValue(null);
});

describe("CRM import analysis guard", () => {
  it("rejects an unauthorized CRM analysis before Falco or account data access", async () => {
    const formData = new FormData();
    formData.append("targetTableHint", "crm_leads");
    const response = await POST(new Request("http://localhost/api/import/analyze", { method: "POST", body: formData }));

    expect(response.status).toBe(403);
    expect(mocks.requireCrmAccess).toHaveBeenCalledWith("user-id");
    expect(mocks.mapImportedFile).not.toHaveBeenCalled();
    expect(mocks.resolveAgentKey).not.toHaveBeenCalled();
  });
});
