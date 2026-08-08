import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  requireUserId: vi.fn(),
  getAccountContext: vi.fn(),
  getInsightHistory: vi.fn(),
  selectResults: [] as unknown[][],
  insertResult: [] as unknown[],
}));

vi.mock("next/cache", () => ({
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/current-user", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/team/context", () => ({ getAccountContext: mocks.getAccountContext }));
vi.mock("./queries", () => ({ getInsightHistory: mocks.getInsightHistory, getAssignableMembers: vi.fn() }));

import { captureCopiloteInsight } from "./actions";
import type { InsightHistoryItem } from "./types";

const conversationId = "00000000-0000-0000-0000-000000000001";
const accountId = "00000000-0000-0000-0000-000000000010";

const input = {
  conversationId,
  title: "Proposer l'appel plus tôt",
  problem: "La proposition arrive trop tard.",
  actionText: "Tester la proposition après qualification.",
  successCriterion: "Comparer 10 conversations qualifiées.",
};

const projection: InsightHistoryItem = {
  id: "00000000-0000-0000-0000-000000000020",
  sourceType: "copilote",
  sourceId: conversationId,
  title: input.title,
  insightText: input.actionText,
  sourceLabel: "Falco · Taux de proposition d'appel",
  decision: "todo",
  generatedAt: "2026-08-08T08:00:00.000Z",
  resumeAt: null,
  periodStart: null,
  periodEnd: null,
  snapshot: {
    kind: "copilote",
    version: 1,
    problem: input.problem,
    actionText: input.actionText,
    successCriterion: input.successCriterion,
  },
  impactProjection: null,
  initiative: null,
  legacy: false,
};

function selectChain(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
}

function insertChain() {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
  };
  chain.values.mockReturnValue(chain);
  chain.onConflictDoNothing.mockReturnValue(chain);
  chain.returning.mockImplementation(() => Promise.resolve(mocks.insertResult));
  return chain;
}

beforeEach(() => {
  mocks.db.select.mockReset();
  mocks.db.insert.mockReset();
  mocks.requireUserId.mockResolvedValue(accountId);
  mocks.getAccountContext.mockResolvedValue({ isOwner: true, accountId, permissions: "all", advancedModulesEnabled: true });
  mocks.getInsightHistory.mockResolvedValue([projection]);
  mocks.selectResults = [];
  mocks.insertResult = [{ id: projection.id }];
  mocks.db.select.mockImplementation(() => selectChain(mocks.selectResults.shift() ?? []));
  mocks.db.insert.mockImplementation(() => insertChain());
});

describe("captureCopiloteInsight", () => {
  it("captures only an owned conversation and derives its source label server-side", async () => {
    mocks.selectResults = [[{ id: conversationId, title: "Nouvelle conversation", topicLabel: "Taux de proposition d'appel" }]];

    const result = await captureCopiloteInsight(input);

    expect(result).toEqual({ error: null, insight: projection });
    const values = mocks.db.insert.mock.results[0]?.value.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values.sourceType).toBe("copilote");
    expect(values.sourceId).toBe(conversationId);
    expect(values.sourceLabel).toBe("Falco · Taux de proposition d'appel");
    expect(values.decision).toBe("todo");
    expect(values.snapshot).toMatchObject({ kind: "copilote", version: 1, problem: input.problem });
  });

  it("rejects a foreign or missing conversation before any write", async () => {
    mocks.selectResults = [[]];

    const result = await captureCopiloteInsight(input);

    expect(result).toEqual({ error: "Conversation introuvable." });
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it("returns the existing insight when a concurrent retry loses the unique conflict", async () => {
    mocks.selectResults = [
      [{ id: conversationId, title: "Chapitre", topicLabel: "Qualification" }],
      [{ id: projection.id }],
    ];
    mocks.insertResult = [];

    const result = await captureCopiloteInsight(input);

    expect(result).toEqual({ error: null, insight: projection });
    expect(mocks.db.insert).toHaveBeenCalledTimes(1);
    expect(mocks.getInsightHistory).toHaveBeenCalledWith(accountId, { sourceType: "copilote", sourceId: conversationId });
  });

  it("surfaces a database failure without leaking the transcript or payload", async () => {
    mocks.selectResults = [[{ id: conversationId, title: "Chapitre", topicLabel: "Qualification" }]];
    mocks.db.insert.mockImplementation(() => {
      const chain = insertChain();
      chain.returning.mockRejectedValue(new Error("database failure"));
      return chain;
    });

    const result = await captureCopiloteInsight(input);

    expect(result).toEqual({ error: "L'action n'a pas pu être enregistrée." });
  });
});
