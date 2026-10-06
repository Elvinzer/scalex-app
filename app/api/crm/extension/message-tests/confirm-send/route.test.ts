import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  confirm: vi.fn(),
  rateLimited: vi.fn(),
}));

vi.mock("@/lib/crm/extension-session", () => ({ getCrmExtensionAccess: mocks.access }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "127.0.0.1", isRateLimited: mocks.rateLimited }));
vi.mock("@/lib/crm/message-ab-tests", () => ({ confirmCrmMessageAbTestSend: mocks.confirm }));

import { POST } from "./route";

const accountId = "00000000-0000-4000-8000-000000000001";
const actorUserId = "00000000-0000-4000-8000-000000000002";
const assignmentId = "00000000-0000-4000-8000-000000000003";
const assignment = {
  id: assignmentId,
  testId: "00000000-0000-4000-8000-000000000004",
  channel: "instagram",
  variant: "A",
  messageSnapshot: "Hello Claire",
  status: "active",
  assignedAt: new Date("2026-10-01T10:00:00.000Z"),
  sentAt: new Date("2026-10-06T10:00:00.000Z"),
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/crm/extension/message-tests/confirm-send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.access.mockReset();
  mocks.confirm.mockReset();
  mocks.rateLimited.mockReset();
  mocks.access.mockResolvedValue({ accountId, userId: actorUserId });
  mocks.rateLimited.mockReturnValue(false);
  mocks.confirm.mockResolvedValue({ state: "confirmed", assignment });
});

describe("CRM extension message-test send confirmation API", () => {
  it("rejects an unauthenticated extension before reading the assignment", async () => {
    mocks.access.mockResolvedValue(null);

    const response = await POST(request({ assignmentId }));

    expect(response.status).toBe(401);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("validates the assignment id before calling the service", async () => {
    const response = await POST(request({ assignmentId: "invalid" }));

    expect(response.status).toBe(422);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("derives the account and actor from the authenticated extension session", async () => {
    const response = await POST(request({ assignmentId }));

    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(accountId, actorUserId, assignmentId);
    await expect(response.json()).resolves.toMatchObject({ assignment: { id: assignmentId }, alreadyConfirmed: false });
  });

  it("returns success for a repeated confirmation without creating another send", async () => {
    mocks.confirm.mockResolvedValue({ state: "already_confirmed", assignment });

    const response = await POST(request({ assignmentId }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ assignment: { id: assignmentId }, alreadyConfirmed: true });
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["test_ended", "test_ended"],
    ["already_contacted", "already_contacted"],
  ] as const)("maps %s to a conflict response", async (state, error) => {
    mocks.confirm.mockResolvedValue({ state });

    const response = await POST(request({ assignmentId }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error });
  });
});
