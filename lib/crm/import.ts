import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

import { normalizeDateCellToIso } from "@/lib/import/date";
import { parseLocaleNumber } from "@/lib/import/number";
import type { CrmImportField } from "@/lib/import/schema";
import type { Locale } from "@/lib/i18n/config";

import {
  CRM_LEAD_OUTCOMES,
  CRM_LEAD_SOURCES,
  CRM_LEAD_STAGES,
  CRM_LOST_REASONS,
  CRM_PLATFORMS,
  type CrmLeadOutcome,
  type CrmLeadSource,
  type CrmLeadStage,
  type CrmLostReason,
  type CrmPlatform,
} from "./types";
import type { CrmImportReview, CrmImportSheet } from "./import-schema";
import { normalizeCrmSource, sheetNeedsDefaultSource } from "./import-source";

export { normalizeCrmSource, sheetNeedsDefaultSource } from "./import-source";

export type CrmImportValue = string | number;
export type CrmImportRowValues = Partial<Record<CrmImportField, CrmImportValue>>;

export type PreparedCrmImportRow = {
  rowKey: string;
  fileName: string;
  sheetName: string;
  rowIndex: number;
  values: CrmImportRowValues;
  phoneNormalized: string | null;
  issues: string[];
};

export type CrmDuplicateGroup = {
  id: string;
  phoneNormalized: string | null;
  rowKeys: string[];
  conflicts: CrmImportField[];
};

export type CrmImportConflict = {
  id: string;
  rowKey: string;
  field: CrmImportField;
  importedValue: CrmImportValue | null;
  existingValue: CrmImportValue | null;
};

export type CrmPreparedSheet = {
  sheet: CrmImportSheet;
  rows: PreparedCrmImportRow[];
  needsDefaultSource: boolean;
};

export type PhoneNormalization = {
  normalized: string | null;
  reason: "missing" | "invalid" | null;
};

export function defaultCountryForLocale(locale: Locale): CountryCode {
  return locale === "en" ? "US" : "FR";
}

export function normalizeCrmPhone(raw: string | null | undefined, locale: Locale): PhoneNormalization {
  const value = raw?.trim() ?? "";
  if (!value) return { normalized: null, reason: "missing" };
  const parsed = parsePhoneNumberFromString(value, defaultCountryForLocale(locale));
  if (!parsed?.isValid()) return { normalized: null, reason: "invalid" };
  return { normalized: parsed.number, reason: null };
}

export function normalizeCrmDate(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  const dateOnly = normalizeDateCellToIso(value);
  if (dateOnly) {
    const parsedDate = new Date(dateOnly + "T00:00:00.000Z");
    if (!Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === dateOnly) return parsedDate.toISOString();
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizedLabel(raw: string): string {
  return raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function enumFromLabel<T extends string>(raw: string | null | undefined, values: readonly T[], aliases: Record<string, T>): T | null {
  const key = normalizedLabel(raw ?? "");
  if (!key) return null;
  if (values.includes(key as T)) return key as T;
  return aliases[key] ?? null;
}

export function normalizeCrmPlatform(raw: string | null | undefined): CrmPlatform | null {
  return enumFromLabel(raw, CRM_PLATFORMS, {
    ig: "instagram",
    insta: "instagram",
    linked_in: "linkedin",
  });
}

export function normalizeCrmStage(raw: string | null | undefined): CrmLeadStage | null {
  return enumFromLabel(raw, CRM_LEAD_STAGES, {
    a_contacter: "first_message_sent",
    a_verifier: "conversation_in_progress",
    first_message: "first_message_sent",
    message_sent: "first_message_sent",
    message_envoye: "first_message_sent",
    premier_message: "first_message_sent",
    premier_message_envoye: "first_message_sent",
    premier_msg_envoye: "first_message_sent",
    non_qualifie: "first_message_sent",
    conversation: "conversation_in_progress",
    conversation_started: "conversation_in_progress",
    conversation_en_cours: "conversation_in_progress",
    video_sent: "value_content_sent",
    video_envoyee: "value_content_sent",
    value_content: "value_content_sent",
    content_sent: "value_content_sent",
    contenu_envoye: "value_content_sent",
    call: "call_proposed",
    call_propose: "call_proposed",
    appel_propose: "call_proposed",
    appointment_proposed: "call_proposed",
    booked: "call_booked",
    call_booke: "call_booked",
    appel_booke: "call_booked",
    appointment_booked: "call_booked",
  });
}

export function normalizeCrmOutcome(raw: string | null | undefined): CrmLeadOutcome | null {
  return enumFromLabel(raw, CRM_LEAD_OUTCOMES, {
    call_annule: "none",
    call_cancelled: "none",
    call_booke: "none",
    call_booked: "none",
    donnee_modifiee: "none",
    follow_up_planifie: "none",
    follow_up_scheduled: "none",
    potentiel: "none",
    potential: "none",
    qualifie: "none",
    qualified: "none",
    replanifie: "none",
    rescheduled: "none",
    no_sale: "lost",
    nosale: "lost",
    strategy_call_outcome_no_sale: "lost",
    noshow: "no_show",
    no_show: "no_show",
    won: "sold",
    sale: "sold",
    sold: "sold",
  });
}

export function normalizeCrmLostReason(raw: string | null | undefined): CrmLostReason | null {
  return enumFromLabel(raw, CRM_LOST_REASONS, {
    no_budget: "pas_le_budget",
    no_time: "pas_le_moment",
    competitor: "concurrent",
    ghosted: "ghoste",
    other: "autre",
  });
}

function cleanString(raw: string | undefined, maxLength = 5000): string | null {
  const value = raw?.trim() ?? "";
  return value ? value.slice(0, maxLength) : null;
}

function normalizeValue(field: CrmImportField, raw: string): CrmImportValue | null {
  const value = raw.trim();
  if (!value) return null;
  if (field === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;
  if (field === "potentialValueEur") {
    const number = parseLocaleNumber(value);
    return number !== null && number >= 0 ? Math.round(number) : null;
  }
  if (field === "leadCreatedAt" || field === "messageOccurredAt" || field === "responseAt" || field === "valueContentAt" || field === "callProposedAt" || field === "callBookedAt") {
    return normalizeCrmDate(value);
  }
  if (field === "source") return normalizeCrmSource(value);
  if (field === "platform") return normalizeCrmPlatform(value);
  if (field === "stage") return normalizeCrmStage(value);
  if (field === "outcome") return normalizeCrmOutcome(value);
  if (field === "lostReason") return normalizeCrmLostReason(value);
  return cleanString(value);
}

function rowCountForSheet(sheet: CrmImportSheet): number {
  return sheet.mapping.mappings
    .filter((mapping) => mapping.targetField !== null)
    .reduce((maximum, mapping) => Math.max(maximum, mapping.columnValues.length), 0);
}

function setIfEmpty(values: CrmImportRowValues, field: CrmImportField, next: CrmImportValue | null): void {
  if (next === null || values[field] !== undefined) return;
  values[field] = next;
}

function deriveNames(values: CrmImportRowValues): void {
  const displayName = typeof values.displayName === "string" ? values.displayName : null;
  const firstName = typeof values.firstName === "string" ? values.firstName : null;
  const lastName = typeof values.lastName === "string" ? values.lastName : null;
  if (!firstName && displayName) {
    const parts = displayName.split(/\s+/).filter(Boolean);
    setIfEmpty(values, "firstName", parts[0] ?? null);
    setIfEmpty(values, "lastName", parts.slice(1).join(" ") || null);
  }
  if (!values.displayName && (firstName || lastName)) {
    values.displayName = [firstName, lastName].filter(Boolean).join(" ");
  }
  if (!values.firstName) values.firstName = (typeof values.handle === "string" && values.handle) || "Lead";
  if (!values.lastName) values.lastName = "";
}

export function prepareCrmSheet(sheet: CrmImportSheet, locale: Locale): CrmPreparedSheet {
  const rowCount = rowCountForSheet(sheet);
  const rows: PreparedCrmImportRow[] = [];
  const fieldMappings = sheet.mapping.mappings.filter((mapping) => mapping.targetField !== null);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const values: CrmImportRowValues = {};
    const issues: string[] = [];
    for (const mapping of fieldMappings) {
      const raw = mapping.columnValues[rowIndex] ?? "";
      if (!raw.trim() || !mapping.targetField) continue;
      const normalized = normalizeValue(mapping.targetField, raw);
      if (normalized === null) {
        if (mapping.targetField === "phone" && raw.trim()) issues.push("invalid_phone");
        if (mapping.targetField === "email" && raw.trim() && !normalizeCrmPhone(raw, locale).normalized) issues.push("invalid_email");
        if (["leadCreatedAt", "messageOccurredAt", "responseAt", "valueContentAt", "callProposedAt", "callBookedAt"].includes(mapping.targetField)) {
          issues.push("invalid_date:" + mapping.targetField);
        }
        if (["source", "platform", "stage", "outcome", "lostReason"].includes(mapping.targetField)) {
          issues.push("invalid_value:" + mapping.targetField);
        }
        continue;
      }
      if (values[mapping.targetField] === undefined) {
        values[mapping.targetField] = normalized;
      } else if (values[mapping.targetField] !== normalized) {
        issues.push("conflicting_mapping:" + mapping.targetField);
      }
    }

    const hasLeadIdentity = ["profileUrl", "handle", "displayName", "firstName", "lastName", "email", "phone"].some((field) => values[field as CrmImportField] !== undefined);
    if (!hasLeadIdentity) issues.push("no_lead_identity");
    if (values.source === undefined && sheet.defaultSource) {
      values.source = sheet.defaultSource;
      const invalidSourceIssue = "invalid_value:source";
      const invalidSourceIndex = issues.indexOf(invalidSourceIssue);
      if (invalidSourceIndex >= 0) issues.splice(invalidSourceIndex, 1);
    }
    deriveNames(values);
    const phone = normalizeCrmPhone(typeof values.phone === "string" ? values.phone : null, locale);
    if (phone.reason === "missing") issues.push("missing_phone");
    if (phone.reason === "invalid" && !issues.includes("invalid_phone")) issues.push("invalid_phone");
    if (values.source === undefined) issues.push("missing_source");
    if (values.leadCreatedAt === undefined) issues.push("missing_lead_created_at");

    const rowKey = sheet.fileHash + ":" + sheet.sheetName + ":" + rowIndex;
    rows.push({
      rowKey,
      fileName: sheet.fileName,
      sheetName: sheet.sheetName,
      rowIndex,
      values,
      phoneNormalized: phone.normalized,
      issues: Array.from(new Set(issues)),
    });
  }

  return { sheet, rows, needsDefaultSource: sheetNeedsDefaultSource(sheet) && !sheet.defaultSource };
}

function comparableValue(value: CrmImportValue | undefined): string {
  return value === undefined ? "" : String(value).trim().toLowerCase();
}

export function duplicateGroups(rows: PreparedCrmImportRow[]): CrmDuplicateGroup[] {
  const groups = new Map<string, PreparedCrmImportRow[]>();
  for (const row of rows) {
    const key = row.phoneNormalized ? "phone:" + row.phoneNormalized : "row:" + row.rowKey;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([id, group]) => ({
      id,
      phoneNormalized: group[0]?.phoneNormalized ?? null,
      rowKeys: group.map((row) => row.rowKey),
      conflicts: ([
        "profileUrl",
        "platform",
        "handle",
        "displayName",
        "firstName",
        "lastName",
        "email",
        "phone",
        "source",
        "offerName",
        "setterName",
        "potentialValueEur",
        "leadCreatedAt",
        "messageOccurredAt",
        "responseAt",
        "valueContentAt",
        "callProposedAt",
        "callBookedAt",
        "stage",
        "outcome",
        "lostReason",
        "qualificationNote",
        "closer",
      ] as const).filter((field) => {
        const values = new Set(group.map((row) => comparableValue(row.values[field])).filter(Boolean));
        return values.size > 1;
      }),
    }));
}

export function mergePreparedRows(rows: PreparedCrmImportRow[], conflictChoices: Record<string, "first" | "last" | "keep" | "replace">, groupId: string): PreparedCrmImportRow {
  const first = rows[0];
  if (!first) throw new Error("Impossible de fusionner un groupe vide.");
  const merged: CrmImportRowValues = { ...first.values };
  for (const row of rows.slice(1)) {
    for (const field of Object.keys(row.values) as CrmImportField[]) {
      const next = row.values[field];
      if (next === undefined) continue;
      if (merged[field] === undefined) {
        merged[field] = next;
        continue;
      }
      const choice = conflictChoices[groupId + ":" + field] ?? "keep";
      if (choice === "last" || choice === "replace") merged[field] = next;
    }
  }
  deriveNames(merged);
  const mergedIssues = Array.from(new Set(rows.flatMap((row) => row.issues))).filter((issue) => {
    if (issue === "no_lead_identity") {
      return !["profileUrl", "handle", "displayName", "firstName", "lastName", "email", "phone"].some((field) => merged[field as CrmImportField] !== undefined);
    }
    if (issue === "missing_phone" || issue === "invalid_phone") return merged.phone === undefined;
    if (issue === "missing_source") return merged.source === undefined;
    if (issue === "missing_lead_created_at") return merged.leadCreatedAt === undefined;
    if (issue.startsWith("invalid_date:")) {
      const field = issue.slice("invalid_date:".length) as CrmImportField;
      return merged[field] === undefined;
    }
    if (issue.startsWith("invalid_value:")) {
      const field = issue.slice("invalid_value:".length) as CrmImportField;
      return merged[field] === undefined;
    }
    return true;
  });
  return { ...first, values: merged, phoneNormalized: first.phoneNormalized, issues: mergedIssues };
}

export function sourceForRow(row: PreparedCrmImportRow, fallback: CrmLeadSource | null): CrmLeadSource | null {
  if (row.issues.includes("invalid_value:source")) return null;
  const value = row.values.source;
  if (typeof value === "string" && CRM_LEAD_SOURCES.includes(value as CrmLeadSource)) return value as CrmLeadSource;
  return fallback;
}

export function stageForRow(row: PreparedCrmImportRow): CrmLeadStage {
  const value = row.values.stage;
  return typeof value === "string" && CRM_LEAD_STAGES.includes(value as CrmLeadStage) ? value as CrmLeadStage : "first_message_sent";
}

export function outcomeForRow(row: PreparedCrmImportRow): CrmLeadOutcome {
  const value = row.values.outcome;
  return typeof value === "string" && CRM_LEAD_OUTCOMES.includes(value as CrmLeadOutcome) ? value as CrmLeadOutcome : "none";
}

export function lostReasonForRow(row: PreparedCrmImportRow): CrmLostReason | null {
  const value = row.values.lostReason;
  return typeof value === "string" && CRM_LOST_REASONS.includes(value as CrmLostReason) ? value as CrmLostReason : null;
}

export function platformForRow(row: PreparedCrmImportRow): CrmPlatform | null {
  const value = row.values.platform;
  return typeof value === "string" && CRM_PLATFORMS.includes(value as CrmPlatform) ? value as CrmPlatform : null;
}

export function eventDateForRow(row: PreparedCrmImportRow, field: CrmImportField): Date | null {
  const value = row.values[field];
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function historicalCreatedAtForRow(row: PreparedCrmImportRow): Date | null {
  return eventDateForRow(row, "leadCreatedAt");
}

export function reviewSheets(payload: CrmImportReview, locale: Locale): CrmPreparedSheet[] {
  return payload.sheets
    .filter((sheet) => sheet.mapping.targetTable === "crm_leads")
    .map((sheet) => prepareCrmSheet(sheet, locale));
}
