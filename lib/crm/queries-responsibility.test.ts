import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn(), where: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));

import { createCrmAction } from "./queries";

const businessId = "00000000-0000-4000-8000-000000000001";
const ownerUserId = "00000000-0000-4000-8000-000000000002";
const actorUserId = "00000000-0000-4000-8000-000000000003";
function rows(data: unknown[]) { return { from: () => ({ where: (condition: SQL) => { mocks.where(condition); return { limit: async () => data }; } }) }; }
function action(responsibleUserId: string) { return { leadId: "00000000-0000-4000-8000-000000000004", category: "prospecting" as const, type: "follow_up" as const, title: "Follow up", dueAt: new Date("2026-11-04T10:00:00Z"), responsibleUserId }; }

beforeEach(() => {
  vi.clearAllMocks();
  // Stop after validating responsibility, at the existing scoped lead lookup.
  mocks.transaction.mockImplementation(async (run) => run({ select: () => rows([]) }));
});

describe("CRM action responsibility in independent businesses", () => {
  it("accepts the business owner without requiring a team membership row", async () => {
    mocks.select.mockReturnValueOnce(rows([{ id: businessId }]));
    await expect(createCrmAction(businessId, actorUserId, action(ownerUserId))).resolves.toBeNull();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledOnce();
    const ownerScope = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(ownerScope.sql).toContain('"businesses"."owner_user_id"');
    expect(ownerScope.params).toEqual([businessId, ownerUserId]);
  });

  it("still accepts an active team member after checking the owner", async () => {
    mocks.select.mockReturnValueOnce(rows([])).mockReturnValueOnce(rows([{ id: "membership" }]));
    await expect(createCrmAction(businessId, ownerUserId, action(actorUserId))).resolves.toBeNull();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    const membershipScope = new PgDialect().sqlToQuery(mocks.where.mock.calls[1]?.[0]);
    expect(membershipScope.params).toEqual([businessId, actorUserId, "active"]);
  });

  it("does not treat the business ID itself as an authorized personal identity", async () => {
    mocks.select.mockReturnValue(rows([]));
    await expect(createCrmAction(businessId, actorUserId, action(businessId))).rejects.toThrow("Le responsable n'appartient pas à ce compte.");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
