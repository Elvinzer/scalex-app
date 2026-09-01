import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rows: Array<{ callId: string }> = [];
  const selectBuilder = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
  };
  selectBuilder.from.mockReturnValue(selectBuilder);
  selectBuilder.leftJoin.mockReturnValue(selectBuilder);
  selectBuilder.where.mockImplementation(() => Promise.resolve(rows));

  const send = vi.fn().mockResolvedValue({ ids: ["event-1", "event-2"] });
  const create = vi.fn((data: { accountId: string; salesCallId: string }) => ({ name: "crm/call-match.requested", data }));

  return {
    db: { select: vi.fn(() => selectBuilder) },
    rows,
    send,
    create,
  };
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/inngest/client", () => ({
  crmCallMatchRequested: { create: mocks.create },
  inngest: { send: mocks.send },
}));

import { enqueueCrmCallMatchSuggestions } from "./call-match-queue";

describe("CRM call match queue", () => {
  beforeEach(() => {
    mocks.rows.splice(0, mocks.rows.length);
    mocks.send.mockClear();
    mocks.create.mockClear();
  });

  it("sends the whole batch in one Inngest request", async () => {
    const firstCallId = "00000000-0000-0000-0000-000000000001";
    const secondCallId = "00000000-0000-0000-0000-000000000002";
    mocks.rows.push({ callId: firstCallId }, { callId: secondCallId });

    await expect(enqueueCrmCallMatchSuggestions("account-id", [firstCallId, secondCallId, firstCallId])).resolves.toBe(2);

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0]?.[0]).toEqual([
      { name: "crm/call-match.requested", data: { accountId: "account-id", salesCallId: firstCallId } },
      { name: "crm/call-match.requested", data: { accountId: "account-id", salesCallId: secondCallId } },
    ]);
  });
});
