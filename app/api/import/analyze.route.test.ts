import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireCrmAccess: vi.fn(),
  requirePermission: vi.fn(),
  mapImportedFile: vi.fn(),
  resolveFalcoProvider: vi.fn(),
  getBusinessProfile: vi.fn(),
  parseImportFile: vi.fn(),
  enrichMapping: vi.fn(),
  db: { select: vi.fn() },
  isRateLimited: vi.fn(() => false),
  getRequestLocale: vi.fn(async () => "fr"),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/crm/access", () => ({ requireCrmAccess: mocks.requireCrmAccess }));
vi.mock("@/lib/team/context", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/agent/import-mapping", () => ({ mapImportedFile: mocks.mapImportedFile }));
vi.mock("@/lib/agent/falco-provider", () => ({ resolveFalcoProvider: mocks.resolveFalcoProvider }));
vi.mock("@/lib/business/queries", () => ({ getBusinessProfile: mocks.getBusinessProfile }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: mocks.isRateLimited }));
vi.mock("@/lib/i18n/locale", () => ({ getRequestLocale: mocks.getRequestLocale }));
vi.mock("@/lib/import/parse", () => ({
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_FILES_PER_IMPORT: 5,
  MAX_ROWS_PER_FILE: 2000,
  ImportParseError: class ImportParseError extends Error {},
  parseImportFile: mocks.parseImportFile,
}));
vi.mock("@/lib/import/aggregate", () => ({ enrichMapping: mocks.enrichMapping, groupValuesByMonth: vi.fn() }));
vi.mock("@/db", () => ({ db: mocks.db }));
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
  mocks.db.select.mockReset();
});

describe("CRM import analysis guard", () => {
  it("rejects an unauthorized CRM analysis before Falco or account data access", async () => {
    const formData = new FormData();
    formData.append("targetTableHint", "crm_leads");
    const response = await POST(new Request("http://localhost/api/import/analyze", { method: "POST", body: formData }));

    expect(response.status).toBe(403);
    expect(mocks.requireCrmAccess).toHaveBeenCalledWith("user-id");
    expect(mocks.mapImportedFile).not.toHaveBeenCalled();
    expect(mocks.resolveFalcoProvider).not.toHaveBeenCalled();
  });
});

describe("CRM import analysis provider", () => {
  it("passes the Falco provider through the route instead of requiring Anthropic", async () => {
    const provider = {
      kind: "groq" as const,
      apiKey: "groq-test-key-not-secret",
      baseURL: "https://example.test/v1/chat/completions",
      model: "test-groq-model",
    };
    const mapping = {
      sheetName: "Leads",
      targetTable: "crm_leads" as const,
      ignoreReason: null,
      mappings: [],
      dateColumnName: null,
      dateColumnValues: null,
      periodDetected: null,
      unmappedColumns: [],
      questions: [],
    };
    const accountRow = { id: "account-id", anthropicApiKeyEncrypted: null };
    const accountSelect = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    accountSelect.from.mockReturnValue(accountSelect);
    accountSelect.where.mockReturnValue(accountSelect);
    accountSelect.limit.mockResolvedValue([accountRow]);
    mocks.db.select.mockReturnValue(accountSelect);
    mocks.requireCrmAccess.mockResolvedValue({ accountId: "account-id" });
    mocks.resolveFalcoProvider.mockResolvedValue(provider);
    mocks.getBusinessProfile.mockResolvedValue({ identity: { businessName: "Test", niche: "" }, sales: { offers: [] } });
    mocks.parseImportFile.mockResolvedValue({
      kind: "table",
      fileName: "leads.csv",
      sheets: [{ name: "Leads", headers: ["Nom"], rows: [["Jane Doe"]], headerRowConfident: true, previewRows: [["Nom"]] }],
    });
    mocks.mapImportedFile.mockResolvedValue({ result: mapping, inputTokens: 12, outputTokens: 8 });
    mocks.enrichMapping.mockReturnValue(mapping);

    const formData = new FormData();
    formData.append("targetTableHint", "crm_leads");
    formData.append("files", new File(["Nom\nJane Doe\n"], "leads.csv", { type: "text/csv" }));
    const response = await POST(new Request("http://localhost/api/import/analyze", { method: "POST", body: formData }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.keySource).toBe("shared");
    expect(body.tokens).toEqual({ inputTokens: 12, outputTokens: 8 });
    expect(mocks.resolveFalcoProvider).toHaveBeenCalledWith(accountRow);
    expect(mocks.mapImportedFile).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sheet" }),
      expect.any(String),
      provider,
      expect.objectContaining({ targetTableHint: "crm_leads" }),
    );
  });
});
