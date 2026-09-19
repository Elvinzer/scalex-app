import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, getLeads, listNativeBookingLeads } = vi.hoisted(() => ({
  execute: vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[][] }>>(),
  getLeads: vi.fn(async () => []),
  listNativeBookingLeads: vi.fn(async () => []),
}));

vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(execute) };
});
vi.mock("@/lib/leads/queries", () => ({ getLeads }));
vi.mock("@/lib/native-booking/leads", () => ({ listNativeBookingLeads }));

import { getRevenueActions } from "./revenue-action-queries";

const accountId = "00000000-0000-4000-8000-000000000001";
const memberId = "00000000-0000-4000-8000-000000000002";
const noAccess = { calls: false, pipeline: false, booking: false };

beforeEach(() => {
  vi.clearAllMocks();
  execute.mockResolvedValue({ rows: [] });
});

describe("dashboard action reads", () => {
  it("does not read sources without destination permissions", async () => {
    expect(await getRevenueActions({ accountId, permissions: noAccess })).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
    expect(getLeads).not.toHaveBeenCalled();
    expect(listNativeBookingLeads).not.toHaveBeenCalled();
  });

  it("reads only pending decisions for this account without call enrichment", async () => {
    execute.mockResolvedValue({ rows: [["call-1", "Ada", "+15551234567", "awaiting_decision", "2026-09-18T10:00:00Z"]] });
    const actions = await getRevenueActions({ accountId, permissions: { ...noAccess, calls: true } });

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('"sales_calls"."user_id" = $1');
    expect(sql).toContain('"sales_calls"."outcome" = $2');
    expect(params).toEqual([accountId, "awaiting_decision"]);
    expect(sql).not.toMatch(/join|transcript|recording|comments|closing_videos/);
    expect(actions[0]).toMatchObject({ id: "call_decision:call-1", phone: "+15551234567", referenceAt: "2026-09-18T10:00:00.000Z" });
  });

  it("keeps an undated decision actionable", async () => {
    execute.mockResolvedValue({ rows: [["call-1", "Ada", null, "awaiting_decision", null]] });
    const actions = await getRevenueActions({ accountId, permissions: { ...noAccess, calls: true } });
    expect(actions[0]).toMatchObject({ id: "call_decision:call-1", referenceAt: null });
  });

  it("scopes CRM actions and their leads to the account and the current member", async () => {
    execute.mockResolvedValue({ rows: [["action-1", "lead-1", "Follow up", "prospecting", "follow_up", "2026-09-18T10:00:00Z", null]] });
    const actions = await getRevenueActions({ accountId, permissions: { ...noAccess, pipeline: true }, crmEnabled: true, crmUserId: memberId });

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('"leads"."account_id" = $1');
    expect(sql).toContain('"crm_actions"."account_id" = $2');
    expect(sql).toContain('"crm_actions"."responsible_user_id" = $4');
    expect(params).toEqual([accountId, accountId, "open", memberId, 500]);
    expect(sql).not.toContain('"sales_calls"');
    expect(getLeads).not.toHaveBeenCalled();
    expect(actions[0]).toMatchObject({ id: "crm_action:action-1", referenceAt: "2026-09-18T10:00:00.000Z" });
  });

  it("only removes the member filter when team access is granted", async () => {
    await getRevenueActions({ accountId, permissions: { ...noAccess, pipeline: true }, crmEnabled: true, crmUserId: memberId, crmViewTeam: true });
    const [sql, params] = execute.mock.calls[0];
    expect(sql).not.toContain('"responsible_user_id"');
    expect(params).toEqual([accountId, accountId, "open", 500]);
  });
});
