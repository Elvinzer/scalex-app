import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    transaction: vi.fn(),
  };
  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    db,
    tx,
    selectResults: [] as Array<{ result: unknown[]; supportsLimit?: boolean }>,
    insertResults: [] as Array<unknown[] | Error>,
    updateResults: [] as Array<unknown[] | Error>,
    txInsertChains: [] as Array<{ values: ReturnType<typeof vi.fn> }>,
    txUpdateChains: [] as Array<{ set: ReturnType<typeof vi.fn> }>,
    getOffers: vi.fn(),
  };
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/business/queries", () => ({ getBusinessSalesOfferDetails: mocks.getOffers }));

import { commitCrmImport, getCrmImportPreview } from "./import-service";
import type { CrmImportReview, CrmImportSheet } from "./import-schema";

const accountId = "00000000-0000-0000-0000-000000000001";
const actorUserId = "00000000-0000-0000-0000-000000000002";
const leadId = "00000000-0000-0000-0000-000000000003";
const auditId = "00000000-0000-0000-0000-000000000004";
const importedLeadId = "00000000-0000-0000-0000-000000000005";
const fileHash = "a".repeat(64);

function selectChain(result: unknown[], supportsLimit = false) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockImplementation(() => (supportsLimit ? chain : Promise.resolve(result)));
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
  chain.returning.mockImplementation(() => {
    const result = mocks.insertResults.shift() ?? [];
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
  mocks.txInsertChains.push(chain);
  return chain;
}

function updateChain() {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockImplementation(() => {
    const result = mocks.updateResults.shift() ?? [];
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
  mocks.txUpdateChains.push(chain);
  return chain;
}

function sheet(): CrmImportSheet {
  return {
    fileName: "leads.csv",
    sheetName: "Leads",
    fileHash,
    headerRowConfident: true,
    previewRows: [],
    defaultSource: null,
    mapping: {
      sheetName: "Leads",
      targetTable: "crm_leads",
      ignoreReason: null,
      mappings: [
        { sourceColumn: "Nom", targetField: "displayName", confidence: "high", granularity: "daily", sampleValues: ["Jane Doe"], columnValues: ["Jane Doe"] },
        { sourceColumn: "Téléphone", targetField: "phone", confidence: "high", granularity: "daily", sampleValues: ["06 12 34 56 78"], columnValues: ["06 12 34 56 78"] },
        { sourceColumn: "Canal", targetField: "source", confidence: "high", granularity: "daily", sampleValues: ["Instagram"], columnValues: ["Instagram"] },
        { sourceColumn: "Créé le", targetField: "leadCreatedAt", confidence: "high", granularity: "daily", sampleValues: ["2026-01-15"], columnValues: ["2026-01-15"] },
        { sourceColumn: "Premier message", targetField: "messageOccurredAt", confidence: "high", granularity: "daily", sampleValues: ["2026-01-16"], columnValues: ["2026-01-16"] },
      ],
      dateColumnName: null,
      dateColumnValues: null,
      periodDetected: null,
      unmappedColumns: [],
      questions: [],
    },
  };
}

function payload(overrides: Partial<CrmImportReview> = {}): CrmImportReview {
  return {
    sheets: [sheet()],
    keySource: "shared",
    tokens: { inputTokens: 12, outputTokens: 8 },
    duplicateDecisions: {},
    existingLeadDecisions: {},
    conflictChoices: {},
    missingPhoneDecisions: {},
    missingDateDecisions: {},
    ...overrides,
  };
}

function existingLead(): Record<string, unknown> {
  const date = new Date("2026-01-10T00:00:00.000Z");
  return {
    id: leadId,
    userId: accountId,
    accountId,
    firstName: "Jane",
    lastName: "Doe",
    email: null,
    phone: "06 12 34 56 78",
    phoneNormalized: "+33612345678",
    source: "instagram",
    platform: "instagram",
    canonicalProfileUrl: null,
    normalizedHandle: null,
    displayName: "Jane Doe",
    socialFirstName: "Jane",
    socialLastName: "Doe",
    metaTouchpointId: null,
    offerId: null,
    potentialValueEur: 0,
    setterId: null,
    closer: null,
    closerUserId: null,
    stage: "nouveau_lead",
    crmStage: "first_message_sent",
    contactState: "new",
    crmOutcome: "none",
    messageOccurredAt: null,
    respondedAt: null,
    qualificationNote: null,
    capturedAt: null,
    isNoShow: false,
    lostReason: null,
    saleId: null,
    reminderDate: null,
    reminderNote: null,
    reminderDone: false,
    createdAt: date,
    updatedAt: date,
  };
}

beforeEach(() => {
  mocks.selectResults = [];
  mocks.insertResults = [];
  mocks.updateResults = [];
  mocks.txInsertChains = [];
  mocks.txUpdateChains = [];
  mocks.getOffers.mockReset();
  mocks.getOffers.mockResolvedValue([]);
  mocks.db.select.mockReset();
  mocks.db.transaction.mockReset();
  mocks.tx.select.mockReset();
  mocks.tx.insert.mockReset();
  mocks.tx.update.mockReset();
  mocks.db.select.mockImplementation(() => {
    const next = mocks.selectResults.shift() ?? { result: [], supportsLimit: false };
    return selectChain(next.result, next.supportsLimit);
  });
  mocks.tx.select.mockImplementation(() => selectChain([]));
  mocks.tx.insert.mockImplementation(() => insertChain());
  mocks.tx.update.mockImplementation(() => updateChain());
  mocks.db.transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
});

describe("CRM import service", () => {
  it("matches an existing account lead by normalized phone during preview", async () => {
    const rowKey = fileHash + ":Leads:0";
    mocks.selectResults = [
      { result: [] },
      { result: [existingLead()] },
    ];

    const result = await getCrmImportPreview(accountId, payload({ existingLeadDecisions: { [rowKey]: "update" } }), "fr");

    expect(result.canCommit).toBe(true);
    expect(result.counts.update).toBe(1);
    expect(result.rows[0]?.existingLeadId).toBe(leadId);
    expect(result.rows[0]?.phoneNormalized).toBe("+33612345678");
  });

  it("blocks an ambiguous existing phone until the user explicitly skips it", async () => {
    const rowKey = fileHash + ":Leads:0";
    const secondLead = { ...existingLead(), id: "00000000-0000-0000-0000-000000000006" };
    mocks.selectResults = [{ result: [] }, { result: [existingLead(), secondLead] }];
    const blocked = await getCrmImportPreview(accountId, payload(), "fr");
    expect(blocked.canCommit).toBe(false);
    expect(blocked.rows[0]?.issues).toContain("multiple_existing_phone_matches");

    mocks.selectResults = [{ result: [] }, { result: [existingLead(), secondLead] }];
    const skipped = await getCrmImportPreview(accountId, payload({ existingLeadDecisions: { [rowKey]: "skip" } }), "fr");
    expect(skipped.canCommit).toBe(true);
    expect(skipped.counts.skipped).toBe(1);
  });

  it("blocks a profile uniqueness collision without using the profile as a merge key", async () => {
    const rowKey = fileHash + ":Leads:0";
    const profileSheet = sheet();
    profileSheet.mapping.mappings = [
      { sourceColumn: "Nom", targetField: "displayName", confidence: "high", granularity: "daily", sampleValues: ["Jane Doe"], columnValues: ["Jane Doe"] },
      { sourceColumn: "Profil", targetField: "profileUrl", confidence: "high", granularity: "daily", sampleValues: ["https://instagram.com/jane"], columnValues: ["https://instagram.com/jane"] },
      { sourceColumn: "Plateforme", targetField: "platform", confidence: "high", granularity: "daily", sampleValues: ["Instagram"], columnValues: ["Instagram"] },
      { sourceColumn: "Canal", targetField: "source", confidence: "high", granularity: "daily", sampleValues: ["Instagram"], columnValues: ["Instagram"] },
      { sourceColumn: "Créé le", targetField: "leadCreatedAt", confidence: "high", granularity: "daily", sampleValues: ["2026-01-15"], columnValues: ["2026-01-15"] },
    ];
    mocks.selectResults = [{ result: [] }, { result: [{ ...existingLead(), canonicalProfileUrl: "https://instagram.com/jane" }] }];

    const blocked = await getCrmImportPreview(accountId, payload({ sheets: [profileSheet] }), "fr");
    expect(blocked.canCommit).toBe(false);
    expect(blocked.rows[0]?.existingLeadId).toBeNull();
    expect(blocked.rows[0]?.issues).toContain("profile_conflict");

    mocks.selectResults = [{ result: [] }, { result: [{ ...existingLead(), canonicalProfileUrl: "https://instagram.com/jane" }] }];
    const skipped = await getCrmImportPreview(accountId, payload({ sheets: [profileSheet], existingLeadDecisions: { [rowKey]: "skip" } }), "fr");
    expect(skipped.canCommit).toBe(true);
    expect(skipped.counts.skipped).toBe(1);
  });

  it("writes historical timestamps, normalized phone, explicit events and an audit summary", async () => {
    mocks.selectResults = [
      { result: [] },
      { result: [] },
      { result: [] },
      { result: [], supportsLimit: true },
    ];
    mocks.insertResults = [[{ id: auditId }], [{ id: importedLeadId }]];
    mocks.updateResults = [[{ id: auditId }]];

    const result = await commitCrmImport(accountId, actorUserId, payload(), "fr");

    expect(result.status).toBe("committed");
    expect(result.create).toBe(1);
    const leadValues = mocks.txInsertChains[1]?.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(leadValues.phoneNormalized).toBe("+33612345678");
    expect(leadValues.createdAt).toEqual(new Date("2026-01-15T00:00:00.000Z"));
    const eventValues = mocks.txInsertChains.find((chain) => {
      const value = chain.values.mock.calls[0]?.[0];
      return value && !Array.isArray(value) && typeof value === "object" && "sourceEventKey" in value;
    })?.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(eventValues.occurredAt).toEqual(new Date("2026-01-15T00:00:00.000Z"));
    const auditUpdate = mocks.txUpdateChains[0]?.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(auditUpdate).toMatchObject({ status: "committed", createdCount: 1, duplicateCount: 0 });
  });

  it("propagates a lead write failure so the surrounding transaction can roll back", async () => {
    mocks.selectResults = [
      { result: [] },
      { result: [] },
      { result: [] },
      { result: [], supportsLimit: true },
    ];
    mocks.insertResults = [[{ id: auditId }], new Error("lead write failed")];

    await expect(commitCrmImport(accountId, actorUserId, payload(), "fr")).rejects.toThrow("lead write failed");
    expect(mocks.txUpdateChains).toHaveLength(0);
  });

  it("returns the committed audit result on an exact retry without opening another transaction", async () => {
    mocks.selectResults = [
      { result: [] },
      { result: [] },
      { result: [] },
      { result: [{ id: auditId, status: "committed" }], supportsLimit: true },
    ];

    const result = await commitCrmImport(accountId, actorUserId, payload(), "fr");

    expect(result).toMatchObject({ status: "already_committed", importId: auditId });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });
});
