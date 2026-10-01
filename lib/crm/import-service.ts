import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { crmImports, crmLeadEvents, crmLeadProfiles, crmLeadStageHistory, leads, setters } from "@/db/schema";
import { getBusinessSalesOfferDetails } from "@/lib/business/queries";
import type { Offer } from "@/lib/business/types";
import type { Locale } from "@/lib/i18n/config";

import {
  duplicateGroups,
  eventDateForRow,
  historicalCreatedAtForRow,
  lostReasonForRow,
  mergePreparedRows,
  normalizeCrmPhone,
  outcomeForRow,
  platformForRow,
  reviewSheets,
  sourceForRow,
  stageForRow,
  type CrmDuplicateGroup,
  type CrmImportConflict,
  type CrmImportRowValues,
  type CrmImportValue,
  type CrmPreparedSheet,
  type PreparedCrmImportRow,
} from "./import";
import {
  crmImportCommitPayloadSchema,
  type CrmImportCommitPayload,
  type CrmImportReview,
} from "./import-schema";
import { eventForOutcome, legacyStageForCrmStage } from "./machine";
import type { CrmEventMetadata, CrmEventType, CrmLeadStage } from "./types";
import { normalizeCapturedProfile } from "./normalization";
import { normalizeEmail, normalizeSearchText } from "./contact";

type LeadRow = typeof leads.$inferSelect;

export class CrmImportValidationError extends Error {
  readonly code: "REVIEW_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INVALID_IMPORT";

  constructor(code: CrmImportValidationError["code"], message: string) {
    super(message);
    this.name = "CrmImportValidationError";
    this.code = code;
  }
}

export type CrmImportPreviewRow = {
  rowKey: string;
  fileName: string;
  sheetName: string;
  rowIndex: number;
  values: CrmImportRowValues;
  phoneNormalized: string | null;
  issues: string[];
  action: "create" | "update" | "skip" | "review" | "merged";
  duplicateGroupId: string | null;
  existingLeadId: string | null;
  conflicts: CrmImportConflict[];
};

export type CrmImportPreview = {
  importKey: string;
  fileHash: string;
  rows: CrmImportPreviewRow[];
  duplicateGroups: Array<CrmDuplicateGroup & { decision: "merge" | "skip" | null }>;
  conflicts: CrmImportConflict[];
  needsDefaultSourceSheets: Array<{ fileName: string; sheetName: string }>;
  counts: {
    sourceRows: number;
    effectiveRows: number;
    create: number;
    update: number;
    merged: number;
    skipped: number;
    duplicates: number;
    unresolved: number;
  };
  canCommit: boolean;
};

type AccountLookups = {
  offers: Offer[];
  setters: Array<{ id: string; name: string }>;
};

function normalizeLookupName(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function findOfferId(name: string | undefined, offers: Offer[]): string | null {
  if (!name) return null;
  const normalized = normalizeLookupName(name);
  return offers.find((offer) => normalizeLookupName(offer.name) === normalized)?.id ?? null;
}

function findSetterId(name: string | undefined, settersList: AccountLookups["setters"]): string | null {
  if (!name) return null;
  const normalized = normalizeLookupName(name);
  return settersList.find((setter) => normalizeLookupName(setter.name) === normalized)?.id ?? null;
}

function cleanComparable(value: CrmImportValue | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? "" : String(value).trim().toLowerCase();
}

function valueForExistingLead(lead: LeadRow, field: keyof CrmImportRowValues, lookups: AccountLookups): CrmImportValue | null {
  switch (field) {
    case "profileUrl":
      return lead.canonicalProfileUrl;
    case "platform":
      return lead.platform;
    case "handle":
      return lead.normalizedHandle;
    case "displayName":
      return lead.displayName;
    case "firstName":
      return lead.firstName;
    case "lastName":
      return lead.lastName;
    case "email":
      return lead.email;
    case "phone":
      return lead.phone;
    case "source":
      return lead.source;
    case "offerName":
      return lookups.offers.find((offer) => offer.id === lead.offerId)?.name ?? null;
    case "setterName":
      return lookups.setters.find((setter) => setter.id === lead.setterId)?.name ?? null;
    case "potentialValueEur":
      return lead.potentialValueEur;
    case "messageOccurredAt":
      return lead.messageOccurredAt?.toISOString() ?? null;
    case "responseAt":
      return lead.respondedAt?.toISOString() ?? null;
    case "stage":
      return lead.crmStage;
    case "outcome":
      return lead.crmOutcome;
    case "lostReason":
      return lead.lostReason;
    case "qualificationNote":
      return lead.qualificationNote;
    case "closer":
      return lead.closer;
    case "leadCreatedAt":
    case "valueContentAt":
    case "callProposedAt":
    case "callBookedAt":
      return null;
  }
  return null;
}

function normalizedPhoneForLead(lead: LeadRow, locale: Locale): string | null {
  if (lead.phoneNormalized) return lead.phoneNormalized;
  if (!lead.phone) return null;
  return normalizeCrmPhone(lead.phone, locale).normalized;
}

function profileKey(platform: string | null | undefined, profileUrl: string | null | undefined): string | null {
  const normalizedPlatform = platform?.trim().toLowerCase() ?? "";
  const normalizedUrl = profileUrl?.trim().replace(/\/+$/, "").toLowerCase() ?? "";
  if (!normalizedPlatform || !normalizedUrl) return null;
  return normalizedPlatform + ":" + normalizedUrl;
}

function profileKeyForRow(row: PreparedCrmImportRow): string | null {
  return profileKey(platformForRow(row), stringValue(row.values, "profileUrl"));
}

function profileKeyForLead(lead: LeadRow): string | null {
  return profileKey(lead.platform, lead.canonicalProfileUrl);
}

function profileConflictRowKeys(
  effective: Array<{ row: PreparedCrmImportRow }>,
  existingByPhone: Map<string, LeadRow[]>,
  existingByProfile: Map<string, LeadRow[]>,
): Set<string> {
  const importedByProfile = new Map<string, string[]>();
  for (const item of effective) {
    const key = profileKeyForRow(item.row);
    if (!key) continue;
    const rowKeys = importedByProfile.get(key) ?? [];
    rowKeys.push(item.row.rowKey);
    importedByProfile.set(key, rowKeys);
  }

  const conflicts = new Set<string>();
  for (const item of effective) {
    const key = profileKeyForRow(item.row);
    if (!key) continue;
    if ((importedByProfile.get(key)?.length ?? 0) > 1) conflicts.add(item.row.rowKey);

    const phoneMatches = item.row.phoneNormalized ? existingByPhone.get(item.row.phoneNormalized) ?? [] : [];
    const phoneMatchIds = new Set(phoneMatches.map((lead) => lead.id));
    if ((existingByProfile.get(key) ?? []).some((lead) => !phoneMatchIds.has(lead.id))) conflicts.add(item.row.rowKey);
  }
  return conflicts;
}

async function accountLookups(accountId: string): Promise<AccountLookups> {
  const [offers, setterRows] = await Promise.all([
    getBusinessSalesOfferDetails(accountId),
    db.select({ id: setters.id, name: setters.name }).from(setters).where(eq(setters.userId, accountId)),
  ]);
  return { offers, setters: setterRows };
}

async function accountLeads(accountId: string): Promise<LeadRow[]> {
  return db.select().from(leads).where(eq(leads.accountId, accountId));
}

function importIdentity(payload: CrmImportReview): { importKey: string; fileHash: string } {
  const fileHash = payload.sheets.map((sheet) => sheet.fileHash).sort().join(":");
  const importKey = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { importKey, fileHash };
}

function duplicateGroupMap(groups: CrmDuplicateGroup[]): Map<string, CrmDuplicateGroup> {
  const map = new Map<string, CrmDuplicateGroup>();
  for (const group of groups) {
    for (const rowKey of group.rowKeys) map.set(rowKey, group);
  }
  return map;
}

function addLookupIssues(row: PreparedCrmImportRow, lookups: AccountLookups): PreparedCrmImportRow {
  const issues = [...row.issues];
  const offerName = typeof row.values.offerName === "string" ? row.values.offerName : undefined;
  const setterName = typeof row.values.setterName === "string" ? row.values.setterName : undefined;
  if (offerName && !findOfferId(offerName, lookups.offers)) issues.push("unknown_offer");
  if (setterName && !findSetterId(setterName, lookups.setters)) issues.push("unknown_setter");
  if (row.values.email && typeof row.values.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.values.email)) issues.push("invalid_email");
  return { ...row, issues: Array.from(new Set(issues)) };
}

function refreshLookupIssues(row: PreparedCrmImportRow, lookups: AccountLookups): PreparedCrmImportRow {
  const offerName = typeof row.values.offerName === "string" ? row.values.offerName : undefined;
  const setterName = typeof row.values.setterName === "string" ? row.values.setterName : undefined;
  const issues = row.issues.filter((issue) => {
    if (issue === "invalid_email") return !row.values.email || typeof row.values.email !== "string" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.values.email);
    if (issue === "unknown_offer") return !offerName || !findOfferId(offerName, lookups.offers);
    if (issue === "unknown_setter") return !setterName || !findSetterId(setterName, lookups.setters);
    return true;
  });
  return addLookupIssues({ ...row, issues }, lookups);
}

function isBlockingIssue(issue: string): boolean {
  return issue === "invalid_email" || issue === "unknown_offer" || issue === "unknown_setter" || issue.startsWith("invalid_date:") || issue.startsWith("invalid_value:") || issue.startsWith("conflicting_mapping:") || issue === "no_lead_identity" || issue === "multiple_existing_phone_matches" || issue === "profile_conflict";
}

function rowConflictId(rowKey: string, field: keyof CrmImportRowValues): string {
  return rowKey + ":" + field;
}

function existingConflicts(row: PreparedCrmImportRow, lead: LeadRow, lookups: AccountLookups): CrmImportConflict[] {
  const conflicts: CrmImportConflict[] = [];
  for (const field of Object.keys(row.values) as Array<keyof CrmImportRowValues>) {
    const importedValue = row.values[field] ?? null;
    if (importedValue === null || field === "leadCreatedAt") continue;
    const existingValue = valueForExistingLead(lead, field, lookups);
    if (cleanComparable(existingValue) && cleanComparable(existingValue) !== cleanComparable(importedValue)) {
      conflicts.push({ id: rowConflictId(row.rowKey, field), rowKey: row.rowKey, field, importedValue, existingValue });
    }
  }
  return conflicts;
}

function preparedRows(payload: CrmImportReview, locale: Locale, lookups: AccountLookups): {
  sheets: CrmPreparedSheet[];
  rows: PreparedCrmImportRow[];
  groups: CrmDuplicateGroup[];
  groupByRow: Map<string, CrmDuplicateGroup>;
} {
  const sheets = reviewSheets(payload, locale).map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row) => refreshLookupIssues(row, lookups)),
  }));
  const rows = sheets.flatMap((sheet) => sheet.rows);
  const groups = duplicateGroups(rows);
  return { sheets, rows, groups, groupByRow: duplicateGroupMap(groups) };
}

function effectiveRows(payload: CrmImportReview, rows: PreparedCrmImportRow[], groups: CrmDuplicateGroup[], lookups?: AccountLookups): Array<{ row: PreparedCrmImportRow; group: CrmDuplicateGroup | null; merged: boolean }> {
  const rowMap = new Map(rows.map((row) => [row.rowKey, row]));
  const groupMap = duplicateGroupMap(groups);
  const effective: Array<{ row: PreparedCrmImportRow; group: CrmDuplicateGroup | null; merged: boolean }> = [];
  const seenGroups = new Set<string>();
  for (const row of rows) {
    const group = groupMap.get(row.rowKey) ?? null;
    if (!group) {
      effective.push({ row, group: null, merged: false });
      continue;
    }
    if (seenGroups.has(group.id)) continue;
    seenGroups.add(group.id);
    if (payload.duplicateDecisions[group.id] === "skip") continue;
    if (payload.duplicateDecisions[group.id] !== "merge") continue;
    const groupRows = group.rowKeys.map((rowKey) => rowMap.get(rowKey)).filter((item): item is PreparedCrmImportRow => Boolean(item));
    const mergedRow = mergePreparedRows(groupRows, payload.conflictChoices, group.id);
    effective.push({ row: lookups ? refreshLookupIssues(mergedRow, lookups) : mergedRow, group, merged: true });
  }
  return effective;
}

function rowAction(
  row: PreparedCrmImportRow,
  group: CrmDuplicateGroup | null,
  existingLead: LeadRow | null,
  conflicts: CrmImportConflict[],
  payload: CrmImportReview,
): CrmImportPreviewRow["action"] {
  if (group && payload.duplicateDecisions[group.id] === "skip") return "skip";
  if (group && payload.duplicateDecisions[group.id] !== "merge") return "review";
  if (group && group.conflicts.some((field) => !payload.conflictChoices[group.id + ":" + field])) return "review";
  if (row.issues.includes("profile_conflict")) {
    return payload.existingLeadDecisions[row.rowKey] === "skip" ? "skip" : "review";
  }
  if (row.issues.includes("multiple_existing_phone_matches")) {
    return payload.existingLeadDecisions[row.rowKey] === "skip" ? "skip" : "review";
  }
  if (row.issues.some((issue) => isBlockingIssue(issue) || (issue === "invalid_phone" && payload.missingPhoneDecisions[row.rowKey] !== "import"))) return "review";
  if (row.issues.includes("missing_source")) return "review";
  if (row.issues.includes("missing_phone") || row.issues.includes("invalid_phone")) {
    if (payload.missingPhoneDecisions[row.rowKey] === "skip") return "skip";
    if (payload.missingPhoneDecisions[row.rowKey] !== "import") return "review";
  }
  if (row.issues.includes("missing_lead_created_at")) {
    if (payload.missingDateDecisions[row.rowKey] === "skip") return "skip";
    if (payload.missingDateDecisions[row.rowKey] !== "use_import_time") return "review";
  }
  if (existingLead && !payload.existingLeadDecisions[row.rowKey]) return "review";
  if (existingLead && payload.existingLeadDecisions[row.rowKey] === "skip") return "skip";
  if (conflicts.some((conflict) => !payload.conflictChoices[conflict.id])) return "review";
  if (group) return existingLead ? "update" : "create";
  return existingLead ? "update" : "create";
}

export async function getCrmImportPreview(accountId: string, payload: CrmImportReview, locale: Locale): Promise<CrmImportPreview> {
  const parsed = crmImportCommitPayloadSchema.omit({ confirmDuplicate: true }).safeParse(payload);
  if (!parsed.success) throw new CrmImportValidationError("INVALID_IMPORT", "Les données de prévisualisation sont invalides.");
  const safePayload = parsed.data;
  const lookups = await accountLookups(accountId);
  const existing = await accountLeads(accountId);
  const { sheets, rows, groups, groupByRow } = preparedRows(safePayload, locale, lookups);
  const existingByPhone = new Map<string, LeadRow[]>();
  const existingByProfile = new Map<string, LeadRow[]>();
  for (const lead of existing) {
    const phone = normalizedPhoneForLead(lead, locale);
    if (phone) {
      const current = existingByPhone.get(phone) ?? [];
      current.push(lead);
      existingByPhone.set(phone, current);
    }
    const profile = profileKeyForLead(lead);
    if (profile) {
      const current = existingByProfile.get(profile) ?? [];
      current.push(lead);
      existingByProfile.set(profile, current);
    }
  }

  const needsDefaultSourceSheets = sheets.filter((sheet) => sheet.needsDefaultSource).map((sheet) => ({ fileName: sheet.sheet.fileName, sheetName: sheet.sheet.sheetName }));
  const effective = effectiveRows(safePayload, rows, groups, lookups);
  const effectiveByGroup = new Map<string, (typeof effective)[number]>();
  const effectiveByRow = new Map<string, (typeof effective)[number]>();
  for (const item of effective) {
    if (item.group) effectiveByGroup.set(item.group.id, item);
    else effectiveByRow.set(item.row.rowKey, item);
  }
  const profileConflicts = profileConflictRowKeys(effective, existingByPhone, existingByProfile);
  const rowPreviews: CrmImportPreviewRow[] = [];
  const conflicts: CrmImportConflict[] = [];
  let unresolved = 0;
  let skipped = 0;
  let merged = 0;
  let create = 0;
  let update = 0;

  for (const row of rows) {
    const group = groupByRow.get(row.rowKey) ?? null;
    const effectiveRow = group ? effectiveByGroup.get(group.id) : effectiveByRow.get(row.rowKey);
    const isMergedChild = Boolean(group && effectiveRow && effectiveRow.row.rowKey !== row.rowKey);
    if (isMergedChild) {
      rowPreviews.push({
        rowKey: row.rowKey,
        fileName: row.fileName,
        sheetName: row.sheetName,
        rowIndex: row.rowIndex,
        values: row.values,
        phoneNormalized: row.phoneNormalized,
        issues: row.issues,
        action: "merged",
        duplicateGroupId: group?.id ?? null,
        existingLeadId: null,
        conflicts: [],
      });
      merged += 1;
      continue;
    }

    const effectivePrepared = effectiveRow?.row ?? row;
    const phoneMatches = effectivePrepared.phoneNormalized ? existingByPhone.get(effectivePrepared.phoneNormalized) ?? [] : [];
    const existingLead = phoneMatches.length === 1 ? phoneMatches[0] ?? null : null;
    const rowIssues = [...effectivePrepared.issues];
    if (profileConflicts.has(effectivePrepared.rowKey)) rowIssues.push("profile_conflict");
    if (phoneMatches.length > 1) rowIssues.push("multiple_existing_phone_matches");
    const rowWithIssues = { ...effectivePrepared, issues: Array.from(new Set(rowIssues)) };
    const rowConflicts = existingLead ? existingConflicts(rowWithIssues, existingLead, lookups) : [];
    conflicts.push(...rowConflicts);
    const action = rowAction(rowWithIssues, group, existingLead, rowConflicts, safePayload);
    if (action === "review") unresolved += 1;
    if (action === "skip") skipped += 1;
    if (action === "create") create += 1;
    if (action === "update") update += 1;
      rowPreviews.push({
        rowKey: row.rowKey,
        fileName: row.fileName,
        sheetName: row.sheetName,
        rowIndex: row.rowIndex,
        values: rowWithIssues.values,
        phoneNormalized: rowWithIssues.phoneNormalized,
        issues: rowWithIssues.issues,
      action,
      duplicateGroupId: group?.id ?? null,
      existingLeadId: existingLead?.id ?? null,
      conflicts: rowConflicts,
    });
  }

  const duplicateCount = groups.reduce((count, group) => count + Math.max(0, group.rowKeys.length - 1), 0);
  const sourceMissing = needsDefaultSourceSheets.length > 0;
  const canCommit = rows.length > 0 && !sourceMissing && unresolved === 0;
  const identity = importIdentity(safePayload);
  return {
    ...identity,
    rows: rowPreviews,
    duplicateGroups: groups.map((group) => ({ ...group, decision: safePayload.duplicateDecisions[group.id] ?? null })),
    conflicts,
    needsDefaultSourceSheets,
    counts: {
      sourceRows: rows.length,
      effectiveRows: effective.length,
      create,
      update,
      merged,
      skipped,
      duplicates: duplicateCount,
      unresolved,
    },
    canCommit,
  };
}

function fieldChoice(payload: CrmImportReview, rowKey: string, field: keyof CrmImportRowValues): "keep" | "replace" {
  const choice = payload.conflictChoices[rowConflictId(rowKey, field)];
  return choice === "replace" ? "replace" : "keep";
}

function shouldWriteField(imported: CrmImportValue | undefined, existing: CrmImportValue | null, choice: "keep" | "replace"): boolean {
  if (imported === undefined || imported === null || imported === "") return false;
  if (!cleanComparable(existing)) return true;
  return cleanComparable(existing) !== cleanComparable(imported) && choice === "replace";
}

function importedDate(row: PreparedCrmImportRow, field: keyof CrmImportRowValues): Date | null {
  return eventDateForRow(row, field);
}

function eventRecord(input: {
  accountId: string;
  leadId: string;
  actorUserId: string;
  type: CrmEventType;
  key: string;
  occurredAt: Date | null;
  capturedAt: Date;
  metadata?: CrmEventMetadata;
}) {
  return {
    accountId: input.accountId,
    leadId: input.leadId,
    actorUserId: input.actorUserId,
    type: input.type,
    source: "migration" as const,
    sourceEventKey: input.key,
    occurredAt: input.occurredAt,
    capturedAt: input.capturedAt,
    metadata: input.metadata ?? {},
  };
}

function explicitStageDate(row: PreparedCrmImportRow, stage: CrmLeadStage): Date | null {
  if (stage === "first_message_sent") return importedDate(row, "messageOccurredAt");
  if (stage === "conversation_in_progress") return importedDate(row, "responseAt");
  if (stage === "value_content_sent") return importedDate(row, "valueContentAt");
  if (stage === "call_proposed") return importedDate(row, "callProposedAt");
  return importedDate(row, "callBookedAt");
}

function stringValue(values: CrmImportRowValues, field: keyof CrmImportRowValues): string | null {
  const value = values[field];
  return typeof value === "string" ? value : null;
}

type CrmImportTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function attachImportedProfile(tx: CrmImportTransaction, accountId: string, leadId: string, row: PreparedCrmImportRow, capturedAt: Date): Promise<void> {
  const platform = platformForRow(row);
  const profileUrl = stringValue(row.values, "profileUrl");
  const handle = stringValue(row.values, "handle");
  if (!platform || (!profileUrl && !handle)) return;
  const profile = normalizeCapturedProfile({
    profileUrl,
    platform,
    handle,
    displayName: stringValue(row.values, "displayName"),
    firstName: stringValue(row.values, "firstName"),
    lastName: stringValue(row.values, "lastName"),
    capturedAt: capturedAt.toISOString(),
  });
  if (!profile) return;
  const [sameNetwork] = await tx.select().from(crmLeadProfiles).where(and(eq(crmLeadProfiles.accountId, accountId), eq(crmLeadProfiles.leadId, leadId), eq(crmLeadProfiles.platform, profile.platform))).limit(1);
  if (sameNetwork) {
    if (sameNetwork.canonicalProfileUrl !== profile.canonicalProfileUrl || sameNetwork.normalizedHandle !== profile.normalizedHandle) {
      throw new CrmImportValidationError("REVIEW_REQUIRED", "Ce lead possède déjà un autre profil sur cette plateforme.");
    }
    return;
  }
  if (profile.canonicalProfileUrl) {
    const [owner] = await tx.select({ leadId: crmLeadProfiles.leadId }).from(crmLeadProfiles).where(and(eq(crmLeadProfiles.accountId, accountId), eq(crmLeadProfiles.platform, profile.platform), eq(crmLeadProfiles.canonicalProfileUrl, profile.canonicalProfileUrl))).limit(1);
    if (owner && owner.leadId !== leadId) throw new CrmImportValidationError("REVIEW_REQUIRED", "Un autre lead utilise déjà ce profil.");
  }
  await tx.insert(crmLeadProfiles).values({
    accountId,
    leadId,
    platform: profile.platform,
    canonicalProfileUrl: profile.canonicalProfileUrl,
    normalizedHandle: profile.normalizedHandle,
    displayName: profile.displayName,
    searchNameNormalized: normalizeSearchText(profile.displayName || `${profile.firstName} ${profile.lastName}`),
    firstName: profile.firstName,
    lastName: profile.lastName || null,
    capturedAt,
    updatedAt: capturedAt,
  });
}

async function writeNewLead(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  accountId: string,
  actorUserId: string,
  importKey: string,
  row: PreparedCrmImportRow,
  lookups: AccountLookups,
  importedAt: Date,
): Promise<string> {
  const source = sourceForRow(row, null);
  if (!source) throw new CrmImportValidationError("REVIEW_REQUIRED", "Chaque lead doit avoir un canal d'acquisition.");
  const stage = stageForRow(row);
  const outcome = outcomeForRow(row);
  const createdAt = historicalCreatedAtForRow(row) ?? importedAt;
  const messageDate = importedDate(row, "messageOccurredAt");
  const responseDate = importedDate(row, "responseAt");
  const setterId = findSetterId(stringValue(row.values, "setterName") ?? undefined, lookups.setters);
  const offerId = findOfferId(stringValue(row.values, "offerName") ?? undefined, lookups.offers);
  const [created] = await tx.insert(leads).values({
    userId: accountId,
    accountId,
    firstName: stringValue(row.values, "firstName") ?? "Lead",
    lastName: stringValue(row.values, "lastName") ?? "",
    email: stringValue(row.values, "email"),
    emailNormalized: normalizeEmail(stringValue(row.values, "email")),
    phone: row.phoneNormalized ? stringValue(row.values, "phone") : null,
    phoneNormalized: row.phoneNormalized,
    source,
    platform: platformForRow(row),
    canonicalProfileUrl: stringValue(row.values, "profileUrl"),
    normalizedHandle: stringValue(row.values, "handle"),
    displayName: stringValue(row.values, "displayName"),
    socialFirstName: stringValue(row.values, "firstName"),
    socialLastName: stringValue(row.values, "lastName"),
    offerId,
    potentialValueEur: typeof row.values.potentialValueEur === "number" ? row.values.potentialValueEur : 0,
    setterId,
    closer: stringValue(row.values, "closer"),
    stage: legacyStageForCrmStage(stage),
    crmStage: stage,
    contactState: stage !== "first_message_sent" || Boolean(messageDate) ? "contacted" : "new",
    crmOutcome: outcome,
    messageOccurredAt: messageDate,
    respondedAt: responseDate,
    qualificationNote: stringValue(row.values, "qualificationNote"),
    capturedAt: importedAt,
    isNoShow: outcome === "no_show",
    lostReason: lostReasonForRow(row),
    createdAt,
    updatedAt: importedAt,
  }).returning({ id: leads.id });
  if (!created) throw new Error("Le lead n'a pas pu être créé.");
  await attachImportedProfile(tx, accountId, created.id, row, importedAt);

  const createdEventKey = importKey + ":" + row.rowKey + ":lead_created";
  await tx.insert(crmLeadEvents).values(eventRecord({
    accountId,
    leadId: created.id,
    actorUserId,
    type: "lead_created",
    key: createdEventKey,
    occurredAt: createdAt,
    capturedAt: importedAt,
    metadata: { source: "crm_import", historical: Boolean(historicalCreatedAtForRow(row)) },
  })).onConflictDoNothing();

  const stageDate = explicitStageDate(row, stage);
  if (stageDate) {
    await tx.insert(crmLeadStageHistory).values({
      accountId,
      leadId: created.id,
      fromStage: null,
      toStage: stage,
      actorUserId,
      responsibleSetterId: setterId,
      source: "migration",
      changedAt: stageDate,
    });
  }

  const events: Array<ReturnType<typeof eventRecord>> = [];
  const eventDates: Array<[keyof CrmImportRowValues, CrmEventType]> = [
    ["messageOccurredAt", "first_message_sent"],
    ["responseAt", "response_received"],
    ["valueContentAt", "value_content_sent"],
    ["callProposedAt", "call_proposed"],
    ["callBookedAt", "call_booked"],
  ];
  for (const [field, type] of eventDates) {
    const occurredAt = importedDate(row, field);
    if (occurredAt) {
      events.push(eventRecord({
        accountId,
        leadId: created.id,
        actorUserId,
        type,
        key: importKey + ":" + row.rowKey + ":" + type,
        occurredAt,
        capturedAt: importedAt,
        metadata: { source: "crm_import" },
      }));
    }
  }
  const outcomeDate = importedDate(row, "callBookedAt") ?? null;
  if (outcome !== "none" && outcomeDate) {
    events.push(eventRecord({
      accountId,
      leadId: created.id,
      actorUserId,
      type: eventForOutcome(outcome),
      key: importKey + ":" + row.rowKey + ":outcome",
      occurredAt: outcomeDate,
      capturedAt: importedAt,
      metadata: { outcome, source: "crm_import" },
    }));
  }
  if (events.length > 0) await tx.insert(crmLeadEvents).values(events).onConflictDoNothing();
  return created.id;
}

async function updateExistingLead(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  accountId: string,
  actorUserId: string,
  importKey: string,
  row: PreparedCrmImportRow,
  lead: LeadRow,
  payload: CrmImportReview,
  lookups: AccountLookups,
  importedAt: Date,
): Promise<void> {
  if (payload.existingLeadDecisions[row.rowKey] !== "update") return;
  const set: Partial<typeof leads.$inferInsert> = { updatedAt: importedAt };
  const setIfAllowed = (field: keyof CrmImportRowValues, column: keyof typeof set, imported: CrmImportValue | undefined, existing: CrmImportValue | null): void => {
    if (shouldWriteField(imported, existing, fieldChoice(payload, row.rowKey, field))) {
      Object.assign(set, { [column]: imported });
    }
  };
  const importedPlatform = platformForRow(row);
  const hasDifferentLegacyProfile = Boolean(importedPlatform && lead.platform && (importedPlatform !== lead.platform || stringValue(row.values, "profileUrl") !== lead.canonicalProfileUrl || stringValue(row.values, "handle") !== lead.normalizedHandle));
  if (!hasDifferentLegacyProfile) {
    setIfAllowed("profileUrl", "canonicalProfileUrl", row.values.profileUrl, lead.canonicalProfileUrl);
    setIfAllowed("platform", "platform", row.values.platform, lead.platform);
    setIfAllowed("handle", "normalizedHandle", row.values.handle, lead.normalizedHandle);
    setIfAllowed("displayName", "displayName", row.values.displayName, lead.displayName);
    setIfAllowed("firstName", "firstName", row.values.firstName, lead.firstName);
    setIfAllowed("lastName", "lastName", row.values.lastName, lead.lastName);
  }
  setIfAllowed("email", "email", row.values.email, lead.email);
  if (row.values.email !== undefined && row.values.email !== null) set.emailNormalized = normalizeEmail(stringValue(row.values, "email"));
  const writeRawPhone = shouldWriteField(row.values.phone, lead.phone, fieldChoice(payload, row.rowKey, "phone"));
  if (writeRawPhone) set.phone = stringValue(row.values, "phone");
  if (row.phoneNormalized && lead.phoneNormalized !== row.phoneNormalized) set.phoneNormalized = row.phoneNormalized;
  setIfAllowed("source", "source", row.values.source, lead.source);
  if (row.values.offerName && shouldWriteField(row.values.offerName, valueForExistingLead(lead, "offerName", lookups), fieldChoice(payload, row.rowKey, "offerName"))) {
    set.offerId = findOfferId(stringValue(row.values, "offerName") ?? undefined, lookups.offers);
  }
  if (row.values.setterName && shouldWriteField(row.values.setterName, valueForExistingLead(lead, "setterName", lookups), fieldChoice(payload, row.rowKey, "setterName"))) {
    set.setterId = findSetterId(stringValue(row.values, "setterName") ?? undefined, lookups.setters);
  }
  setIfAllowed("potentialValueEur", "potentialValueEur", row.values.potentialValueEur, lead.potentialValueEur);
  setIfAllowed("closer", "closer", row.values.closer, lead.closer);
  setIfAllowed("qualificationNote", "qualificationNote", row.values.qualificationNote, lead.qualificationNote);
  const messageDate = importedDate(row, "messageOccurredAt");
  const responseDate = importedDate(row, "responseAt");
  const messageDateAllowed = Boolean(messageDate && (!lead.messageOccurredAt || fieldChoice(payload, row.rowKey, "messageOccurredAt") === "replace"));
  const responseDateAllowed = Boolean(responseDate && (!lead.respondedAt || fieldChoice(payload, row.rowKey, "responseAt") === "replace"));
  if (messageDateAllowed && messageDate) {
    set.messageOccurredAt = messageDate;
    set.contactState = "contacted";
  }
  if (responseDateAllowed && responseDate) {
    set.respondedAt = responseDate;
    set.contactState = "contacted";
  }

  const importedStage = row.values.stage ? stageForRow(row) : null;
  if (importedStage && importedStage !== lead.crmStage && fieldChoice(payload, row.rowKey, "stage") === "replace") {
    set.crmStage = importedStage;
    set.stage = legacyStageForCrmStage(importedStage);
    if (importedStage !== "first_message_sent") set.contactState = "contacted";
  }
  const importedOutcome = row.values.outcome ? outcomeForRow(row) : null;
  const outcomeDate = importedDate(row, "callBookedAt");
  if (importedOutcome && importedOutcome !== lead.crmOutcome && fieldChoice(payload, row.rowKey, "outcome") === "replace") {
    set.crmOutcome = importedOutcome;
    set.isNoShow = importedOutcome === "no_show";
  }
  if (shouldWriteField(row.values.lostReason, lead.lostReason, fieldChoice(payload, row.rowKey, "lostReason"))) {
    set.lostReason = lostReasonForRow(row);
  }
  const [updated] = await tx.update(leads).set(set).where(and(eq(leads.id, lead.id), eq(leads.accountId, accountId))).returning({ id: leads.id });
  if (!updated) throw new Error("Le lead existant n'a pas pu être mis à jour.");
  await attachImportedProfile(tx, accountId, lead.id, row, importedAt);

  const events: Array<ReturnType<typeof eventRecord>> = [];
  const eventDates: Array<[keyof CrmImportRowValues, CrmEventType]> = [
    ["messageOccurredAt", "first_message_sent"],
    ["responseAt", "response_received"],
    ["valueContentAt", "value_content_sent"],
    ["callProposedAt", "call_proposed"],
    ["callBookedAt", "call_booked"],
  ];
  for (const [field, type] of eventDates) {
    const occurredAt = importedDate(row, field);
    const allowed = field === "messageOccurredAt" ? messageDateAllowed : field === "responseAt" ? responseDateAllowed : Boolean(occurredAt);
    if (occurredAt && allowed) events.push(eventRecord({ accountId, leadId: lead.id, actorUserId, type, key: importKey + ":" + row.rowKey + ":" + type, occurredAt, capturedAt: importedAt, metadata: { source: "crm_import" } }));
  }
  if (importedOutcome && importedOutcome !== lead.crmOutcome && outcomeDate && fieldChoice(payload, row.rowKey, "outcome") === "replace") {
    events.push(eventRecord({
      accountId,
      leadId: lead.id,
      actorUserId,
      type: eventForOutcome(importedOutcome),
      key: importKey + ":" + row.rowKey + ":outcome",
      occurredAt: outcomeDate,
      capturedAt: importedAt,
      metadata: { outcome: importedOutcome, source: "crm_import" },
    }));
  }
  if (events.length > 0) await tx.insert(crmLeadEvents).values(events).onConflictDoNothing();
  const stage = importedStage;
  const stageDate = stage ? explicitStageDate(row, stage) : null;
  if (stage && stage !== lead.crmStage && stageDate && fieldChoice(payload, row.rowKey, "stage") === "replace") {
    await tx.insert(crmLeadStageHistory).values({
      accountId,
      leadId: lead.id,
      fromStage: lead.crmStage,
      toStage: stage,
      actorUserId,
      responsibleSetterId: lead.setterId,
      source: "migration",
      changedAt: stageDate,
    });
    await tx.insert(crmLeadEvents).values(eventRecord({
      accountId,
      leadId: lead.id,
      actorUserId,
      type: "stage_changed",
      key: importKey + ":" + row.rowKey + ":stage_changed",
      occurredAt: stageDate,
      capturedAt: importedAt,
      metadata: { fromStage: lead.crmStage, toStage: stage },
    })).onConflictDoNothing();
  }
}

export type CrmImportCommitResult = CrmImportPreview["counts"] & {
  status: "committed" | "already_committed";
  importId: string;
  importKey: string;
};

export async function commitCrmImport(accountId: string, actorUserId: string, rawPayload: CrmImportCommitPayload, locale: Locale): Promise<CrmImportCommitResult> {
  const parsed = crmImportCommitPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) throw new CrmImportValidationError("INVALID_IMPORT", "Les données d'import sont invalides.");
  const payload = parsed.data;
  const lookups = await accountLookups(accountId);
  const preview = await getCrmImportPreview(accountId, payload, locale);
  if (!preview.canCommit) throw new CrmImportValidationError("REVIEW_REQUIRED", "Termine la revue des canaux, doublons et conflits avant d'importer.");

  const existingImport = await db.select().from(crmImports).where(and(eq(crmImports.accountId, accountId), eq(crmImports.importKey, preview.importKey))).limit(1);
  if (existingImport[0]?.status === "committed") {
    return { ...preview.counts, status: "already_committed", importId: existingImport[0].id, importKey: preview.importKey };
  }
  if (existingImport[0]?.status && existingImport[0].status !== "draft") {
    throw new CrmImportValidationError("IDEMPOTENCY_CONFLICT", "Cet import existe déjà avec un autre état.");
  }

  const parsedRows = preparedRows(payload, locale, lookups);
  const effective = effectiveRows(payload, parsedRows.rows, parsedRows.groups, lookups);
  const importedAt = new Date();
  const result = await db.transaction(async (tx) => {
    const [audit] = existingImport[0]
      ? await tx.update(crmImports).set({ status: "draft", completedAt: null }).where(and(eq(crmImports.id, existingImport[0].id), eq(crmImports.accountId, accountId))).returning()
      : await tx.insert(crmImports).values({
          accountId,
          actorUserId,
          fileName: payload.sheets[0]?.fileName ?? "crm-import",
          fileHash: preview.fileHash,
          importKey: preview.importKey,
          status: "draft",
          rowsCount: preview.counts.sourceRows,
          keySource: payload.keySource,
          inputTokens: payload.tokens.inputTokens,
          outputTokens: payload.tokens.outputTokens,
        }).returning();
    if (!audit) throw new Error("Le journal d'import n'a pas pu être créé.");

    let createdCount = 0;
    let updatedCount = 0;
    let mergedCount = 0;
    let skippedCount = parsedRows.groups
      .filter((group) => payload.duplicateDecisions[group.id] === "skip")
      .reduce((count, group) => count + group.rowKeys.length, 0);
    const currentLeads = await tx.select().from(leads).where(eq(leads.accountId, accountId));
    const currentByPhone = new Map<string, LeadRow[]>();
    const currentByProfile = new Map<string, LeadRow[]>();
    for (const lead of currentLeads) {
      const phone = lead.phoneNormalized ?? (lead.phone ? normalizeCrmPhone(lead.phone, locale).normalized : null);
      if (phone) {
        const list = currentByPhone.get(phone) ?? [];
        list.push(lead);
        currentByPhone.set(phone, list);
      }
      const profile = profileKeyForLead(lead);
      if (profile) {
        const list = currentByProfile.get(profile) ?? [];
        list.push(lead);
        currentByProfile.set(profile, list);
      }
    }
    const profileConflicts = profileConflictRowKeys(effective, currentByPhone, currentByProfile);

    for (const item of effective) {
      const row = item.row;
      if (row.issues.includes("missing_lead_created_at") && payload.missingDateDecisions[row.rowKey] === "skip") {
        skippedCount += 1;
        continue;
      }
      if (row.issues.includes("missing_lead_created_at") && payload.missingDateDecisions[row.rowKey] === "use_import_time") {
        row.values.leadCreatedAt = importedAt.toISOString();
      }
      if ((row.issues.includes("missing_phone") || row.issues.includes("invalid_phone")) && payload.missingPhoneDecisions[row.rowKey] !== "import") {
        skippedCount += 1;
        continue;
      }
      if (row.issues.includes("multiple_existing_phone_matches") && payload.existingLeadDecisions[row.rowKey] === "skip") {
        skippedCount += 1;
        continue;
      }
      if (profileConflicts.has(row.rowKey)) {
        if (payload.existingLeadDecisions[row.rowKey] === "skip") {
          skippedCount += 1;
          continue;
        }
        throw new CrmImportValidationError("REVIEW_REQUIRED", "Un profil existe déjà avec cette plateforme et cette URL.");
      }
      const source = sourceForRow(row, null);
      if (!source) throw new CrmImportValidationError("REVIEW_REQUIRED", "Un canal d'acquisition manque sur une ligne importée.");
      const matches = row.phoneNormalized ? currentByPhone.get(row.phoneNormalized) ?? [] : [];
      const existingLead = matches.length === 1 ? matches[0] ?? null : null;
      if (existingLead) {
        if (payload.existingLeadDecisions[row.rowKey] === "skip") {
          skippedCount += 1;
          continue;
        }
        await updateExistingLead(tx, accountId, actorUserId, preview.importKey, row, existingLead, payload, lookups, importedAt);
        updatedCount += 1;
      } else {
        const createdId = await writeNewLead(tx, accountId, actorUserId, preview.importKey, row, lookups, importedAt);
        if (row.phoneNormalized) currentByPhone.set(row.phoneNormalized, [{ ...rowToTemporaryLead(row, createdId, accountId, importedAt), phoneNormalized: row.phoneNormalized }]);
        createdCount += 1;
      }
      if (item.merged) mergedCount += Math.max(0, item.group?.rowKeys.length ?? 1) - 1;
    }

    const counts = {
      sourceRows: preview.counts.sourceRows,
      effectiveRows: preview.counts.effectiveRows,
      create: createdCount,
      update: updatedCount,
      merged: mergedCount,
      skipped: skippedCount,
      duplicates: preview.counts.duplicates,
      unresolved: 0,
    };
    const [completed] = await tx.update(crmImports).set({
      status: "committed",
      createdCount,
      updatedCount,
      mergedCount,
      skippedCount,
      duplicateCount: preview.counts.duplicates,
      unresolvedCount: 0,
      summary: { created: createdCount, updated: updatedCount, merged: mergedCount, skipped: skippedCount, duplicates: preview.counts.duplicates },
      completedAt: importedAt,
    }).where(and(eq(crmImports.id, audit.id), eq(crmImports.accountId, accountId))).returning({ id: crmImports.id });
    if (!completed) throw new Error("Le journal d'import n'a pas pu être finalisé.");
    return { ...counts, importId: audit.id, importKey: preview.importKey };
  });
  return { ...result, status: "committed" };
}

function rowToTemporaryLead(row: PreparedCrmImportRow, id: string, accountId: string, importedAt: Date): LeadRow {
  return {
    id,
    userId: accountId,
    accountId,
    firstName: stringValue(row.values, "firstName") ?? "Lead",
    lastName: stringValue(row.values, "lastName") ?? "",
    email: stringValue(row.values, "email"),
    emailNormalized: normalizeEmail(stringValue(row.values, "email")),
    phone: row.phoneNormalized ? stringValue(row.values, "phone") : null,
    phoneNormalized: row.phoneNormalized,
    source: sourceForRow(row, "autre") ?? "autre",
    platform: platformForRow(row),
    canonicalProfileUrl: stringValue(row.values, "profileUrl"),
    normalizedHandle: stringValue(row.values, "handle"),
    displayName: stringValue(row.values, "displayName"),
    socialFirstName: stringValue(row.values, "firstName"),
    socialLastName: stringValue(row.values, "lastName"),
    metaTouchpointId: null,
    offerId: null,
    potentialValueEur: typeof row.values.potentialValueEur === "number" ? row.values.potentialValueEur : 0,
    setterId: null,
    closer: stringValue(row.values, "closer"),
    closerUserId: null,
    stage: legacyStageForCrmStage(stageForRow(row)),
    crmStage: stageForRow(row),
    contactState: "new",
    crmOutcome: outcomeForRow(row),
    messageOccurredAt: importedDate(row, "messageOccurredAt"),
    respondedAt: importedDate(row, "responseAt"),
    qualificationNote: stringValue(row.values, "qualificationNote"),
    capturedAt: importedAt,
    isNoShow: false,
    lostReason: null,
    saleId: null,
    reminderDate: null,
    reminderNote: null,
    reminderDone: false,
    createdAt: historicalCreatedAtForRow(row) ?? importedAt,
    updatedAt: importedAt,
  };
}
