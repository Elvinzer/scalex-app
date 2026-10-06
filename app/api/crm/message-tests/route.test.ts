import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/crm/http-access", () => ({ getAuthenticatedCrmApiAccess: mocks.access }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "127.0.0.1", isRateLimited: () => false }));
vi.mock("@/lib/crm/message-ab-tests", () => ({
  listCrmMessageAbTests: mocks.list,
  createCrmMessageAbTest: mocks.create,
  isCrmMessageAbTestUniqueViolation: (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23505",
}));

import { GET, POST } from "./route";

const accountId = "00000000-0000-4000-8000-000000000001";
const actorUserId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.list.mockReset();
  mocks.create.mockReset();
  mocks.access.mockResolvedValue({ userId: actorUserId, access: { accountId } });
  mocks.list.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ id: "test-id" });
});

describe("CRM message test collection API", () => {
  it("requires CRM view access before listing account tests", async () => {
    mocks.access.mockResolvedValue({ error: "unauthorized" });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("lists only the account supplied by authenticated CRM access", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(accountId);
  });

  it("rejects incomplete test definitions before writing", async () => {
    const response = await POST(new NextRequest("http://localhost/api/crm/message-tests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Incomplete" }),
    }));

    expect(response.status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("derives account and actor from the authenticated session for creation", async () => {
    const response = await POST(new NextRequest("http://localhost/api/crm/message-tests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "request-1",
        name: "Opening question",
        channel: "linkedin",
        variantAMessage: "Hi {first_name}",
        variantBMessage: "I liked your latest post",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      accountId,
      actorUserId,
      idempotencyKey: "request-1",
      name: "Opening question",
      channel: "linkedin",
      variantAMessage: "Hi {first_name}",
      variantBMessage: "I liked your latest post",
    });
  });

  it("returns a conflict when a channel already has an active test", async () => {
    mocks.create.mockRejectedValue(Object.assign(new Error("unique constraint"), { code: "23505" }));
    const response = await POST(new NextRequest("http://localhost/api/crm/message-tests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "request-2",
        name: "Opening question",
        channel: "linkedin",
        variantAMessage: "Hi {first_name}",
        variantBMessage: "I liked your latest post",
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "active_test_exists" });
  });
});
