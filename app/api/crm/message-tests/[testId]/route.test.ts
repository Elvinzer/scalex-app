import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/crm/http-access", () => ({ getAuthenticatedCrmApiAccess: mocks.access }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "127.0.0.1", isRateLimited: () => false }));
vi.mock("@/lib/crm/message-ab-tests", () => ({
  getCrmMessageAbTest: mocks.get,
  updateCrmMessageAbTestStatus: mocks.update,
  isCrmMessageAbTestUniqueViolation: () => false,
}));

import { GET, PATCH } from "./route";

const accountId = "00000000-0000-4000-8000-000000000001";
const testId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.get.mockReset();
  mocks.update.mockReset();
  mocks.access.mockResolvedValue({ userId: "actor", access: { accountId } });
  mocks.get.mockResolvedValue(null);
  mocks.update.mockResolvedValue({ state: "not_found" });
});

describe("CRM message test item API", () => {
  it("keeps test reads inside the authenticated account", async () => {
    const response = await GET(new NextRequest(`http://localhost/api/crm/message-tests/${testId}`), { params: Promise.resolve({ testId }) });

    expect(response.status).toBe(404);
    expect(mocks.get).toHaveBeenCalledWith(accountId, testId);
  });

  it("requires the management permission before a lifecycle mutation", async () => {
    mocks.access.mockResolvedValue({ error: "forbidden" });
    const response = await PATCH(new NextRequest(`http://localhost/api/crm/message-tests/${testId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    }), { params: Promise.resolve({ testId }) });

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("validates lifecycle commands and passes only the session account to the service", async () => {
    const response = await PATCH(new NextRequest(`http://localhost/api/crm/message-tests/${testId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    }), { params: Promise.resolve({ testId }) });

    expect(response.status).toBe(404);
    expect(mocks.update).toHaveBeenCalledWith(accountId, testId, "resume");
  });
});
