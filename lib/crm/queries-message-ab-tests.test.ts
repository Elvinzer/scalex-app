import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { select: vi.fn(), transaction: vi.fn() };
  const tx = { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
  return {
    db,
    tx,
    accountSelectResults: [] as unknown[][],
    txSelectResults: [] as unknown[][],
    assignment: vi.fn(),
    insertedValues: [] as unknown[],
  };
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("./message-ab-tests", () => ({
  getCrmMessageAbTestAssignmentByLead: mocks.assignment,
  isCrmMessageAbTestEligibleCapture: (input: { source: string; contactState: string; channel: string; messageOccurredAt?: string | null }) => input.source === "extension" && input.contactState === "new" && !input.messageOccurredAt && (input.channel === "instagram" || input.channel === "linkedin"),
  isCrmMessageAbTestUniqueViolation: () => false,
  pickCrmMessageAbTestVariant: () => "A",
  renderCrmMessageAbTestMessage: (template: string, firstName: string) => template.replace(/\{(?:first_name|prenom|prénom)\}/gi, firstName),
}));

import { createCrmLead } from "./queries";
import type { CrmCapturedProfile } from "./types";

const accountId = "00000000-0000-4000-8000-000000000001";
const leadId = "00000000-0000-4000-8000-000000000003";
const setterId = "00000000-0000-4000-8000-000000000004";
const capturedAt = new Date("2026-10-06T10:00:00.000Z");

function selectChain(results: unknown[][], returnsImmediately = false) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.for.mockReturnValue(chain);
  chain.where.mockReturnValue(returnsImmediately ? Promise.resolve(results.shift() ?? []) : chain);
  chain.limit.mockImplementation(() => Promise.resolve(results.shift() ?? []));
  return chain;
}

const profile: CrmCapturedProfile = {
  platform: "instagram",
  canonicalProfileUrl: "https://instagram.com/claire",
  normalizedHandle: "claire",
  displayName: "Claire Martin",
  firstName: "Claire",
  lastName: "Martin",
  messageOccurredAt: null,
  capturedAt: capturedAt.toISOString(),
  email: null,
  phone: null,
};

const existingLead = {
  id: leadId,
  accountId,
  platform: "instagram",
  canonicalProfileUrl: profile.canonicalProfileUrl,
  normalizedHandle: profile.normalizedHandle,
  phoneNormalized: null,
  phone: null,
  displayName: profile.displayName,
  firstName: "Claire",
  lastName: "Martin",
  source: "instagram",
  offerId: null,
  potentialValueEur: 0,
  closer: null,
  closerUserId: null,
  saleId: null,
  crmStage: "first_message_sent",
  contactState: "new",
  crmOutcome: "none",
  isNoShow: false,
  lostReason: null,
  respondedAt: null,
  qualificationNote: null,
  email: null,
  setterId,
  createdAt: capturedAt,
  updatedAt: capturedAt,
  messageOccurredAt: null,
  capturedAt,
};

beforeEach(() => {
  mocks.accountSelectResults = [];
  mocks.txSelectResults = [];
  mocks.db.select.mockReset();
  mocks.db.transaction.mockReset();
  mocks.tx.select.mockReset();
  mocks.tx.insert.mockReset();
  mocks.tx.update.mockReset();
  mocks.insertedValues = [];
  mocks.assignment.mockReset();
  mocks.db.select.mockImplementation(() => selectChain(mocks.accountSelectResults));
  mocks.tx.select.mockImplementation(() => selectChain(mocks.txSelectResults));
  mocks.tx.insert.mockImplementation(() => {
    const chain = {
      values: vi.fn((value: unknown) => {
        mocks.insertedValues.push(value);
        return chain;
      }),
      returning: vi.fn(async () => [existingLead]),
      onConflictDoNothing: vi.fn(async () => undefined),
    };
    return chain;
  });
  mocks.db.transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
  mocks.assignment.mockResolvedValue({
    id: "assignment-id",
    testId: "test-id",
    channel: "instagram",
    variant: "A",
    messageSnapshot: "Bonjour Claire",
    status: "active",
    assignedAt: capturedAt,
    sentAt: null,
  });
});

describe("CRM extension A/B assignment capture idempotency", () => {
  it("stores a personalized immutable assignment for a newly captured lead", async () => {
    const testId = "00000000-0000-4000-8000-000000000005";
    const activeTest = {
      id: testId,
      variantAMessage: "Salut {prénom}",
      variantBMessage: "Bonjour {first_name}",
    };
    mocks.accountSelectResults = [[{ setter: { id: setterId, name: "Setter" } }]];
    mocks.txSelectResults = [[], [], [], [], [activeTest]];
    mocks.assignment.mockResolvedValue(null);

    const result = await createCrmLead(accountId, {
      profile,
      actorUserId: "actor-id",
      responsibleSetterId: setterId,
      source: "extension",
      idempotencyKey: "capture-event-new-lead",
    });

    expect(result.created).toBe(true);
    expect(mocks.insertedValues[0]).toMatchObject({ contactState: "new", messageOccurredAt: null });
    expect(mocks.insertedValues).toContainEqual(expect.objectContaining({
      accountId,
      testId,
      leadId,
      variant: "A",
      messageSnapshot: "Salut Claire",
    }));
  });

  it("marks a newly captured conversation as contacted and skips A/B assignment", async () => {
    mocks.accountSelectResults = [[{ setter: { id: setterId, name: "Setter" } }]];
    mocks.txSelectResults = [[], [], [], [], [{
      id: "00000000-0000-4000-8000-000000000005",
      variantAMessage: "Salut {prénom}",
      variantBMessage: "Bonjour {first_name}",
    }]];
    mocks.assignment.mockResolvedValue(null);

    const result = await createCrmLead(accountId, {
      profile: { ...profile, messageOccurredAt: "2026-10-05T09:00:00.000Z" },
      actorUserId: "actor-id",
      responsibleSetterId: setterId,
      source: "extension",
      idempotencyKey: "capture-event-existing-conversation",
    });

    expect(result.created).toBe(true);
    expect(mocks.insertedValues[0]).toMatchObject({ contactState: "contacted", messageOccurredAt: null });
    expect(mocks.insertedValues).not.toContainEqual(expect.objectContaining({ testId: expect.any(String) }));
    expect(mocks.assignment).toHaveBeenCalledWith(accountId, leadId);
  });

  it("returns the existing lead and original assignment on an exact capture retry", async () => {
    const captureKey = "capture-event-1";
    const existingEvent = {
      lead: existingLead,
      event: { id: "event-id", sourceEventKey: captureKey },
    };
    mocks.accountSelectResults = [[{ setter: { id: setterId, name: "Setter" } }], [{ setter: { id: setterId, name: "Setter" } }]];
    mocks.txSelectResults = [[existingEvent], [existingEvent]];

    const input = {
      profile,
      actorUserId: "actor-id",
      responsibleSetterId: setterId,
      source: "extension" as const,
      idempotencyKey: captureKey,
    };
    const first = await createCrmLead(accountId, input);
    const retry = await createCrmLead(accountId, input);

    expect(first.created).toBe(false);
    expect(retry.created).toBe(false);
    expect(first.lead.id).toBe(leadId);
    expect(retry.lead.id).toBe(leadId);
    expect(first.messageTestAssignment?.id).toBe("assignment-id");
    expect(retry.messageTestAssignment?.id).toBe("assignment-id");
    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(mocks.assignment).toHaveBeenCalledTimes(2);
  });

  it("rejects reusing a capture key for a different social profile", async () => {
    mocks.accountSelectResults = [[{ setter: { id: setterId, name: "Setter" } }]];
    mocks.txSelectResults = [[{
      event: { id: "event-id", sourceEventKey: "capture-event-1" },
      lead: { ...existingLead, normalizedHandle: "someone-else" },
    }]];

    await expect(createCrmLead(accountId, {
      profile,
      actorUserId: "actor-id",
      responsibleSetterId: setterId,
      source: "extension",
      idempotencyKey: "capture-event-1",
    })).rejects.toThrow("CRM_IDEMPOTENCY_CONFLICT");
    expect(mocks.assignment).not.toHaveBeenCalled();
  });
});
