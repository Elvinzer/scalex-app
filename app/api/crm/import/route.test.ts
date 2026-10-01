import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/crm/access", () => ({ requireCrmAccess: vi.fn() }));
vi.mock("@/lib/crm/import-service", () => ({
  getCrmImportPreview: vi.fn(),
  commitCrmImport: vi.fn(),
  CrmImportValidationError: class CrmImportValidationError extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: vi.fn(() => false) }));
vi.mock("@/lib/i18n/locale", () => ({ getRequestLocale: vi.fn(async () => "fr") }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { requireCrmAccess } from "@/lib/crm/access";
import { commitCrmImport, getCrmImportPreview } from "@/lib/crm/import-service";
import { createClient } from "@/lib/supabase/server";

import { POST as previewPost } from "./preview/route";
import { POST as commitPost } from "./commit/route";

const mockedCreateClient = vi.mocked(createClient);
const mockedRequireCrmAccess = vi.mocked(requireCrmAccess);
const mockedPreview = vi.mocked(getCrmImportPreview);
const mockedCommit = vi.mocked(commitCrmImport);

function configureSession(claims: unknown): void {
  const getClaims = vi.fn(async () => ({ data: { claims } }));
  mockedCreateClient.mockResolvedValue({ auth: { getClaims } } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  configureSession({ sub: "user-id" });
  mockedRequireCrmAccess.mockResolvedValue({ userId: "user-id", accountId: "account-id", isOwner: true, permissions: "all" });
});

describe("CRM import route guards", () => {
  it("rejects a missing session before reading the import body", async () => {
    configureSession(null);
    const response = await previewPost(new Request("http://localhost/api/crm/import/preview", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(mockedRequireCrmAccess).not.toHaveBeenCalled();
  });

  it("rejects a payload that tries to submit an account identifier", async () => {
    const response = await previewPost(new Request("http://localhost/api/crm/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "other-account" }),
    }));
    expect(response.status).toBe(422);
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  it("requires CRM write permission before building an import preview", async () => {
    mockedRequireCrmAccess.mockResolvedValueOnce(null);
    const response = await previewPost(new Request("http://localhost/api/crm/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    expect(response.status).toBe(403);
    expect(mockedRequireCrmAccess).toHaveBeenCalledWith("user-id", "crm:manage-pipeline");
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  it("requires CRM write permission for commit", async () => {
    mockedRequireCrmAccess.mockResolvedValueOnce(null);
    const response = await commitPost(new Request("http://localhost/api/crm/import/commit", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
    expect(mockedCommit).not.toHaveBeenCalled();
  });
});
