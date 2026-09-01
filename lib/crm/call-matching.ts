import type {
  CrmCallMatchCandidateView,
  CrmCallMatchConfidence,
  CrmCallMatchReasonCode,
  CrmPlatform,
} from "./types";

export type CallMatchCallInput = {
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  source: string;
  externalReference: string;
  scheduledAt: string;
  eventType: string | null;
  closer: string | null;
  setterId: string | null;
};

export type CallMatchLeadInput = {
  id: string;
  displayName: string | null;
  firstName: string;
  lastName: string;
  normalizedHandle: string | null;
  canonicalProfileUrl: string | null;
  platform: CrmPlatform | null;
  email?: string | null;
  phone?: string | null;
  setterId: string | null;
  closer: string | null;
  createdAt: string;
  updatedAt: string;
  messageOccurredAt: string | null;
  capturedAt: string | null;
};

export type RankedCallMatchCandidate = Omit<CrmCallMatchCandidateView, "id" | "leadName" | "leadHandle" | "reasons"> & {
  leadId: string;
  leadName: string;
  leadHandle: string | null;
  reasons: CrmCallMatchReasonCode[];
};

const CALL_MATCH_VERSION = "crm-call-match-v1";

export function buildCallMatchFingerprint(call: CallMatchCallInput, candidates: RankedCallMatchCandidate[]): string {
  const payload = {
    version: CALL_MATCH_VERSION,
    call: {
      name: normalizeMatchText(call.inviteeName),
      email: normalizeMatchEmail(call.inviteeEmail),
      phone: normalizeMatchPhone(call.inviteePhone),
      source: call.source,
      reference: call.externalReference,
      scheduledAt: call.scheduledAt,
      eventType: normalizeMatchText(call.eventType),
      closer: normalizeMatchText(call.closer),
      setterId: call.setterId,
    },
    candidates: candidates.map((candidate) => ({ leadId: candidate.leadId, score: candidate.score, rank: candidate.rank })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function normalizeMatchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeMatchEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeMatchPhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeMatchHandle(value: string | null | undefined): string {
  const normalized = normalizeMatchText(value).replace(/\s+/g, "");
  return normalized.replace(/^https?instagramcom/, "").replace(/^https?linkedincom/, "");
}

function leadName(lead: CallMatchLeadInput): string {
  return lead.displayName?.trim() || [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || lead.normalizedHandle || "Lead";
}

function comparableDates(lead: CallMatchLeadInput): string[] {
  return [lead.messageOccurredAt, lead.capturedAt, lead.createdAt, lead.updatedAt].filter((value): value is string => Boolean(value));
}

function timeDistanceHours(callDate: string, lead: CallMatchLeadInput): number | null {
  const callTimestamp = Date.parse(callDate);
  if (Number.isNaN(callTimestamp)) return null;
  const distances = comparableDates(lead).map((value) => Math.abs(callTimestamp - Date.parse(value))).filter(Number.isFinite);
  if (distances.length === 0) return null;
  return Math.min(...distances) / (60 * 60 * 1000);
}

function addReason(reasons: CrmCallMatchReasonCode[], code: CrmCallMatchReasonCode): void {
  if (!reasons.includes(code)) reasons.push(code);
}

function confidenceFor(score: number, reasons: CrmCallMatchReasonCode[]): CrmCallMatchConfidence {
  if (reasons.includes("exact_email") || reasons.includes("exact_phone") || reasons.includes("exact_profile")) return "high";
  if (score >= 55 && reasons.includes("name_match") && reasons.includes("time_proximity")) return "medium";
  return "low";
}

function missingEvidence(call: CallMatchCallInput): string[] {
  const missing: string[] = [];
  if (!normalizeMatchEmail(call.inviteeEmail)) missing.push("email");
  if (!normalizeMatchPhone(call.inviteePhone)) missing.push("phone");
  if (!call.inviteeName?.trim()) missing.push("name");
  return missing;
}

function phonesMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const minimumComparableDigits = 9;
  return left.length >= minimumComparableDigits && right.length >= minimumComparableDigits && left.slice(-minimumComparableDigits) === right.slice(-minimumComparableDigits);
}

function nameScore(callName: string, candidateName: string): { score: number; matched: boolean } {
  const normalizedCallName = normalizeMatchText(callName);
  const normalizedCandidateName = normalizeMatchText(candidateName);
  if (!normalizedCallName || !normalizedCandidateName) return { score: 0, matched: false };
  if (normalizedCallName === normalizedCandidateName) return { score: 42, matched: true };

  const callParts = new Set(normalizedCallName.split(" "));
  const candidateParts = new Set(normalizedCandidateName.split(" "));
  const sharedParts = [...callParts].filter((part) => part.length > 1 && candidateParts.has(part));
  if (sharedParts.length >= 2) return { score: 30, matched: true };
  if (sharedParts.length === 1 && (callParts.size === 1 || candidateParts.size === 1)) return { score: 14, matched: true };
  return { score: 0, matched: false };
}

function samePlatform(call: CallMatchCallInput, lead: CallMatchLeadInput): boolean {
  if (!lead.platform) return false;
  if (call.source === lead.platform) return true;
  if (call.eventType?.toLowerCase().includes(lead.platform)) return true;
  return false;
}

export function rankCallMatchCandidates(call: CallMatchCallInput, leads: CallMatchLeadInput[], limit = 5): RankedCallMatchCandidate[] {
  const normalizedEmail = normalizeMatchEmail(call.inviteeEmail);
  const normalizedPhone = normalizeMatchPhone(call.inviteePhone);
  const normalizedCallReference = normalizeMatchHandle(call.externalReference);
  const normalizedCallName = call.inviteeName ? normalizeMatchText(call.inviteeName) : "";
  const names = new Map<string, number>();
  for (const lead of leads) {
    const name = normalizeMatchText(leadName(lead));
    if (name) names.set(name, (names.get(name) ?? 0) + 1);
  }

  return leads
    .map((lead) => {
      const reasons: CrmCallMatchReasonCode[] = [];
      let score = 0;
      const candidateName = leadName(lead);
      const normalizedLeadEmail = normalizeMatchEmail(lead.email);
      const normalizedLeadPhone = normalizeMatchPhone(lead.phone);
      const normalizedLeadProfile = normalizeMatchHandle(lead.canonicalProfileUrl ?? lead.normalizedHandle);

      if (normalizedEmail && normalizedLeadEmail && normalizedEmail === normalizedLeadEmail) {
        score += 100;
        addReason(reasons, "exact_email");
      }
      if (normalizedPhone && normalizedLeadPhone && phonesMatch(normalizedPhone, normalizedLeadPhone)) {
        score += 90;
        addReason(reasons, "exact_phone");
      }
      if (normalizedCallReference && normalizedLeadProfile && normalizedCallReference === normalizedLeadProfile) {
        score += 100;
        addReason(reasons, "exact_profile");
      }

      const namesMatch = nameScore(call.inviteeName ?? "", candidateName);
      if (namesMatch.matched) {
        score += namesMatch.score;
        addReason(reasons, "name_match");
      }
      if (normalizedCallName && names.get(normalizedCallName) && (names.get(normalizedCallName) ?? 0) > 1) addReason(reasons, "common_name");

      const hours = timeDistanceHours(call.scheduledAt, lead);
      if (hours !== null && hours <= 48) {
        score += 25;
        addReason(reasons, "time_proximity");
      } else if (hours !== null && hours <= 24 * 7) {
        score += 15;
        addReason(reasons, "time_proximity");
      } else if (hours !== null && hours <= 24 * 30) {
        score += 6;
        addReason(reasons, "time_proximity");
      }

      if (call.setterId && lead.setterId && call.setterId === lead.setterId) {
        score += 8;
        addReason(reasons, "attribution_match");
      }
      if (call.closer && lead.closer && normalizeMatchText(call.closer) === normalizeMatchText(lead.closer)) {
        score += 8;
        addReason(reasons, "attribution_match");
      }
      if (samePlatform(call, lead)) {
        score += 7;
        addReason(reasons, "platform_match");
      }
      if (call.eventType && lead.platform && normalizeMatchText(call.eventType).includes(lead.platform)) {
        score += 4;
        addReason(reasons, "event_type_match");
      }

      if (!normalizedEmail && !normalizedPhone && !normalizedCallReference) addReason(reasons, "missing_contact");
      const boundedScore = Math.min(score, 100);
      return {
        leadId: lead.id,
        leadName: candidateName,
        leadHandle: lead.normalizedHandle,
        rank: 0,
        score: boundedScore,
        confidence: confidenceFor(boundedScore, reasons),
        reasonCodes: reasons,
        reasons,
        missingEvidence: missingEvidence(call),
      } satisfies RankedCallMatchCandidate;
    })
    .filter((candidate) => candidate.reasonCodes.length > 0 && candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.leadName.localeCompare(right.leadName))
    .slice(0, limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function capFalcoCandidateIds(candidateIds: string[], allowedIds: Set<string>, limit = 3): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of candidateIds) {
    if (!allowedIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= limit) break;
  }
  return result;
}
import { createHash } from "node:crypto";
