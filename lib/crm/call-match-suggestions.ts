import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { crmCallLinks, crmCallMatchCandidates, crmCallMatchSuggestions, crmLeadEvents, leads, salesCalls, users } from "@/db/schema";
import { NoAgentKeyAvailableError } from "@/lib/agent/client";
import { requestFalcoJson, resolveFalcoProvider } from "@/lib/agent/falco-provider";
import { SharedKeyQuotaExceededError } from "@/lib/agent/quota";

import { buildCallMatchFingerprint, capFalcoCandidateIds, normalizeMatchEmail, normalizeMatchPhone, rankCallMatchCandidates, type CallMatchCallInput, type CallMatchLeadInput, type RankedCallMatchCandidate } from "./call-matching";
import { parseFalcoCallMatchResponse } from "./call-matching-schemas";
import type { CrmCallMatchConfidence, CrmCallMatchDecision, CrmCallMatchReasonCode, CrmCallMatchStatus, CrmCallMatchSuggestionView } from "./types";

const MAX_SHORTLIST = 5;
const MAX_DISPLAYED_CANDIDATES = 3;
const SUGGESTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SuggestionRow = typeof crmCallMatchSuggestions.$inferSelect;

type CandidateRow = {
  candidate: typeof crmCallMatchCandidates.$inferSelect;
  lead: {
    displayName: string | null;
    firstName: string;
    lastName: string;
    normalizedHandle: string | null;
  };
};

function displayLeadName(lead: { displayName: string | null; firstName: string; lastName: string; normalizedHandle: string | null }): string {
  return lead.displayName?.trim() || [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || lead.normalizedHandle || "Lead";
}

function isExpired(suggestion: SuggestionRow, now = new Date()): boolean {
  return Boolean(suggestion.expiresAt && suggestion.expiresAt <= now && (suggestion.status === "ready" || suggestion.status === "ambiguous"));
}

function viewStatus(suggestion: SuggestionRow, now = new Date()): CrmCallMatchStatus {
  return isExpired(suggestion, now) ? "expired" : suggestion.status;
}

function toSuggestionView(suggestion: SuggestionRow, candidateRows: CandidateRow[], now = new Date()): CrmCallMatchSuggestionView {
  return {
    id: suggestion.id,
    status: viewStatus(suggestion, now),
    confidence: suggestion.confidence,
    candidates: candidateRows
      .sort((left, right) => left.candidate.rank - right.candidate.rank)
      .map(({ candidate, lead }) => ({
        id: candidate.id,
        leadId: candidate.leadId,
        leadName: displayLeadName(lead),
        leadHandle: lead.normalizedHandle,
        rank: candidate.rank,
        score: candidate.score,
        confidence: candidate.confidence,
        reasonCodes: candidate.reasonCodes,
        reasons: candidate.reasonCodes.map((code, index) => ({ code, label: candidate.reasons[index] ?? code })),
        missingEvidence: candidate.missingEvidence,
      })),
    generatedAt: suggestion.generatedAt?.toISOString() ?? null,
    expiresAt: suggestion.expiresAt?.toISOString() ?? null,
    modelVersion: suggestion.modelVersion,
    failureCode: suggestion.failureCode,
  };
}

export async function getCrmCallSuggestions(accountId: string, callIds: string[]): Promise<Map<string, CrmCallMatchSuggestionView>> {
  if (callIds.length === 0) return new Map();
  const suggestionRows = await db
    .select()
    .from(crmCallMatchSuggestions)
    .where(and(eq(crmCallMatchSuggestions.accountId, accountId), inArray(crmCallMatchSuggestions.salesCallId, callIds)))
    .orderBy(desc(crmCallMatchSuggestions.updatedAt));

  const latestByCall = new Map<string, SuggestionRow>();
  for (const suggestion of suggestionRows) {
    if (!latestByCall.has(suggestion.salesCallId)) latestByCall.set(suggestion.salesCallId, suggestion);
  }
  const latest = [...latestByCall.values()];
  if (latest.length === 0) return new Map();

  const candidateRows = await db
    .select({
      candidate: crmCallMatchCandidates,
      lead: {
        displayName: leads.displayName,
        firstName: leads.firstName,
        lastName: leads.lastName,
        normalizedHandle: leads.normalizedHandle,
      },
    })
    .from(crmCallMatchCandidates)
    .innerJoin(leads, eq(crmCallMatchCandidates.leadId, leads.id))
    .where(and(inArray(crmCallMatchCandidates.suggestionId, latest.map((suggestion) => suggestion.id)), eq(leads.accountId, accountId)))
    .orderBy(asc(crmCallMatchCandidates.rank));

  const rowsBySuggestion = new Map<string, CandidateRow[]>();
  for (const row of candidateRows) {
    const rows = rowsBySuggestion.get(row.candidate.suggestionId) ?? [];
    rows.push(row);
    rowsBySuggestion.set(row.candidate.suggestionId, rows);
  }

  return new Map(latest.map((suggestion) => [suggestion.salesCallId, toSuggestionView(suggestion, rowsBySuggestion.get(suggestion.id) ?? [])]));
}

export async function getCrmCallSuggestion(accountId: string, callId: string): Promise<CrmCallMatchSuggestionView | null> {
  return (await getCrmCallSuggestions(accountId, [callId])).get(callId) ?? null;
}

type MatchableCallRow = {
  id: string;
  userId: string;
  iclosedCallId: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  scheduledAt: Date;
  eventType: string | null;
  source: string;
  closer: string | null;
  setterId: string | null;
};

function callInput(call: MatchableCallRow): CallMatchCallInput {
  return {
    inviteeName: call.inviteeName,
    inviteeEmail: call.inviteeEmail,
    inviteePhone: call.inviteePhone,
    source: call.source,
    externalReference: call.iclosedCallId,
    scheduledAt: call.scheduledAt.toISOString(),
    eventType: call.eventType,
    closer: call.closer,
    setterId: call.setterId,
  };
}

function leadInput(lead: typeof leads.$inferSelect, contact: { email: string | null; phone: string | null } | undefined): CallMatchLeadInput {
  return {
    id: lead.id,
    displayName: lead.displayName,
    firstName: lead.firstName,
    lastName: lead.lastName,
    normalizedHandle: lead.normalizedHandle,
    canonicalProfileUrl: lead.canonicalProfileUrl,
    platform: lead.platform,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    setterId: lead.setterId,
    closer: lead.closer,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    messageOccurredAt: lead.messageOccurredAt?.toISOString() ?? null,
    capturedAt: lead.capturedAt?.toISOString() ?? null,
  };
}

function confidenceRank(value: CrmCallMatchConfidence): number {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function boundedConfidence(base: CrmCallMatchConfidence, falco: CrmCallMatchConfidence): CrmCallMatchConfidence {
  return confidenceRank(base) < confidenceRank(falco) ? base : falco;
}

function failureStatus(error: unknown): { status: "unavailable" | "failed"; code: string } {
  if (error instanceof NoAgentKeyAvailableError) return { status: "unavailable", code: "no_provider" };
  if (error instanceof SharedKeyQuotaExceededError) return { status: "unavailable", code: "shared_quota" };
  return { status: "failed", code: "provider_error" };
}

function logMatchMetrics(
  status: CrmCallMatchStatus,
  provider: Awaited<ReturnType<typeof resolveFalcoProvider>> | null,
  inputTokens: number,
  outputTokens: number,
  candidateCount: number,
  startedAt: number,
): void {
  console.info("[crm-call-match] completed", {
    status,
    provider: provider?.kind ?? "none",
    source: provider?.kind === "anthropic" ? provider.source : provider ? "shared" : null,
    inputTokens,
    outputTokens,
    candidateCount,
    durationMs: Date.now() - startedAt,
  });
}

function agentPrompt(call: CallMatchCallInput, candidates: RankedCallMatchCandidate[]): string {
  const safeCall = {
    inviteeName: call.inviteeName,
    source: call.source,
    scheduledAt: call.scheduledAt,
    eventType: call.eventType,
    hasEmail: Boolean(normalizeMatchEmail(call.inviteeEmail)),
    hasPhone: Boolean(normalizeMatchPhone(call.inviteePhone)),
  };
  const safeCandidates = candidates.map((candidate) => ({
    leadId: candidate.leadId,
    leadName: candidate.leadName,
    handle: candidate.leadHandle,
    scoreDeterministic: candidate.score,
    reasonCodes: candidate.reasonCodes,
  }));
  return JSON.stringify({ call: safeCall, candidates: safeCandidates });
}

const MATCH_SYSTEM_PROMPT = [
  "Tu es Falco et tu aides à rapprocher un appel d'un lead CRM.",
  "Réponds uniquement avec un objet JSON valide, sans markdown.",
  "Utilise uniquement les leadId présents dans la liste reçue. Ne crée jamais d'identifiant.",
  "Choisis candidate si un lead est suffisamment étayé, ambiguous si plusieurs restent plausibles, no_match si aucun ne l'est et unavailable si tu ne peux pas évaluer.",
  "La confiance est un niveau de revue, pas une probabilité. Un nom seul ne peut jamais produire high.",
  "Le JSON doit contenir status, confidence et candidates. Chaque candidat contient leadId, confidence, reasonCodes, reasons et missingEvidence.",
].join("\n");

async function updateSuggestion(
  suggestionId: string,
  accountId: string,
  values: Partial<typeof crmCallMatchSuggestions.$inferInsert>,
  candidates: Array<typeof crmCallMatchCandidates.$inferInsert>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(crmCallMatchCandidates).where(eq(crmCallMatchCandidates.suggestionId, suggestionId));
    await tx
      .update(crmCallMatchSuggestions)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(crmCallMatchSuggestions.id, suggestionId), eq(crmCallMatchSuggestions.accountId, accountId)));
    if (candidates.length > 0) await tx.insert(crmCallMatchCandidates).values(candidates);
  });
}

export async function generateCrmCallMatchSuggestion(accountId: string, callId: string, force = false): Promise<CrmCallMatchSuggestionView | null> {
  const startedAt = Date.now();
  const [call] = await db
    .select({
      id: salesCalls.id,
      userId: salesCalls.userId,
      iclosedCallId: salesCalls.iclosedCallId,
      inviteeName: salesCalls.inviteeName,
      inviteeEmail: salesCalls.inviteeEmail,
      inviteePhone: salesCalls.inviteePhone,
      scheduledAt: salesCalls.scheduledAt,
      eventType: salesCalls.eventType,
      source: salesCalls.source,
      closer: salesCalls.closer,
      setterId: salesCalls.setterId,
    })
    .from(salesCalls)
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)))
    .limit(1);
  if (!call) return null;

  const [link] = await db
    .select({ leadId: crmCallLinks.leadId })
    .from(crmCallLinks)
    .where(and(eq(crmCallLinks.accountId, accountId), eq(crmCallLinks.salesCallId, callId)))
    .limit(1);
  if (link) return null;

  const leadRows = await db.select().from(leads).where(eq(leads.accountId, accountId)).orderBy(desc(leads.updatedAt));
  const contactRows = leadRows.length === 0 ? [] : await db
    .select({ leadId: crmCallLinks.leadId, email: salesCalls.inviteeEmail, phone: salesCalls.inviteePhone })
    .from(crmCallLinks)
    .innerJoin(salesCalls, and(eq(crmCallLinks.salesCallId, salesCalls.id), eq(salesCalls.userId, accountId)))
    .where(and(eq(crmCallLinks.accountId, accountId), inArray(crmCallLinks.leadId, leadRows.map((lead) => lead.id))))
    .orderBy(desc(salesCalls.updatedAt));
  const contactByLead = new Map<string, { email: string | null; phone: string | null }>();
  for (const contact of contactRows) {
    const current = contactByLead.get(contact.leadId);
    if (!current) {
      contactByLead.set(contact.leadId, { email: contact.email, phone: contact.phone });
      continue;
    }
    if (!current.email && contact.email) current.email = contact.email;
    if (!current.phone && contact.phone) current.phone = contact.phone;
  }
  const ranked = rankCallMatchCandidates(callInput(call), leadRows.map((lead) => leadInput(lead, contactByLead.get(lead.id))), MAX_SHORTLIST);
  const fingerprint = buildCallMatchFingerprint(callInput(call), ranked);
  const [existing] = await db
    .select()
    .from(crmCallMatchSuggestions)
    .where(and(eq(crmCallMatchSuggestions.accountId, accountId), eq(crmCallMatchSuggestions.salesCallId, callId), eq(crmCallMatchSuggestions.inputFingerprint, fingerprint)))
    .limit(1);

  if (existing && !force && !isExpired(existing) && existing.status !== "queued" && existing.status !== "failed" && existing.status !== "unavailable") {
    return getCrmCallSuggestion(accountId, callId);
  }

  const now = new Date();
  const [suggestion] = await db
    .insert(crmCallMatchSuggestions)
    .values({ accountId, salesCallId: callId, inputFingerprint: fingerprint, status: "queued", decision: null, decidedByUserId: null, decidedAt: null })
    .onConflictDoUpdate({
      target: [crmCallMatchSuggestions.accountId, crmCallMatchSuggestions.salesCallId, crmCallMatchSuggestions.inputFingerprint],
      set: { status: "queued", confidence: null, failureCode: null, decision: null, decidedByUserId: null, decidedAt: null, updatedAt: now },
    })
    .returning();
  if (!suggestion) return null;

  if (ranked.length === 0) {
    logMatchMetrics("no_match", null, 0, 0, 0, startedAt);
    await updateSuggestion(suggestion.id, accountId, {
      status: "no_match",
      confidence: null,
      candidateCount: 0,
      generatedAt: now,
      expiresAt: new Date(now.getTime() + SUGGESTION_TTL_MS),
      failureCode: null,
      modelVersion: null,
      keySource: null,
    }, []);
    return getCrmCallSuggestion(accountId, callId);
  }

  const [account] = await db
    .select({ id: users.id, anthropicApiKeyEncrypted: users.anthropicApiKeyEncrypted })
    .from(users)
    .where(eq(users.id, accountId))
    .limit(1);
  if (!account) return null;

  let provider: Awaited<ReturnType<typeof resolveFalcoProvider>>;
  try {
    provider = await resolveFalcoProvider(account);
  } catch (error) {
    const failure = failureStatus(error);
    logMatchMetrics(failure.status, null, 0, 0, ranked.length, startedAt);
    await updateSuggestion(suggestion.id, accountId, { status: failure.status, candidateCount: ranked.length, failureCode: failure.code, generatedAt: now, expiresAt: null }, []);
    return getCrmCallSuggestion(accountId, callId);
  }

  let response: Response;
  try {
    response = await requestFalcoJson(provider, MATCH_SYSTEM_PROMPT, agentPrompt(callInput(call), ranked), 0, 900);
  } catch {
    logMatchMetrics("failed", provider, 0, 0, ranked.length, startedAt);
    await updateSuggestion(suggestion.id, accountId, { status: "failed", candidateCount: ranked.length, failureCode: "provider_error", generatedAt: now, expiresAt: null, modelVersion: provider.model, keySource: provider.kind === "anthropic" ? provider.source : "shared" }, []);
    return getCrmCallSuggestion(accountId, callId);
  }
  if (!response.ok) {
    logMatchMetrics("failed", provider, 0, 0, ranked.length, startedAt);
    await updateSuggestion(suggestion.id, accountId, { status: "failed", candidateCount: ranked.length, failureCode: "provider_http", generatedAt: now, expiresAt: null, modelVersion: provider.model, keySource: provider.kind === "anthropic" ? provider.source : "shared" }, []);
    return getCrmCallSuggestion(accountId, callId);
  }

  const parsed = parseFalcoCallMatchResponse(await response.json());
  if (!parsed) {
    logMatchMetrics("failed", provider, 0, 0, ranked.length, startedAt);
    await updateSuggestion(suggestion.id, accountId, { status: "failed", candidateCount: ranked.length, failureCode: "invalid_response", generatedAt: now, expiresAt: null, modelVersion: provider.model, keySource: provider.kind === "anthropic" ? provider.source : "shared" }, []);
    return getCrmCallSuggestion(accountId, callId);
  }

  const allowedIds = new Set(ranked.map((candidate) => candidate.leadId));
  const orderedIds = capFalcoCandidateIds(parsed.result.candidates.map((candidate) => candidate.leadId), allowedIds, MAX_DISPLAYED_CANDIDATES);
  const rankedById = new Map(ranked.map((candidate) => [candidate.leadId, candidate]));
  const responseById = new Map(parsed.result.candidates.map((candidate) => [candidate.leadId, candidate]));
  if (parsed.result.status === "candidate" && orderedIds.length === 0) {
    logMatchMetrics("failed", provider, parsed.inputTokens, parsed.outputTokens, ranked.length, startedAt);
    await updateSuggestion(suggestion.id, accountId, { status: "failed", candidateCount: ranked.length, failureCode: "invalid_candidate", generatedAt: now, expiresAt: null, modelVersion: provider.model, keySource: provider.kind === "anthropic" ? provider.source : "shared" }, []);
    return getCrmCallSuggestion(accountId, callId);
  }

  const candidateValues = orderedIds.flatMap((leadId, index) => {
    const base = rankedById.get(leadId);
    const falco = responseById.get(leadId);
    if (!base || !falco) return [];
    const reasonCodes = [...new Set<CrmCallMatchReasonCode>([...base.reasonCodes, ...falco.reasonCodes])];
    const confidence = boundedConfidence(base.confidence, falco.confidence);
    return [{
      suggestionId: suggestion.id,
      leadId,
      rank: index + 1,
      score: base.score,
      confidence,
      reasonCodes,
      reasons: falco.reasons,
      missingEvidence: [...new Set([...base.missingEvidence, ...falco.missingEvidence])],
    }];
  });

  const finalStatus: CrmCallMatchStatus = parsed.result.status === "candidate" ? "ready" : parsed.result.status === "ambiguous" ? "ambiguous" : parsed.result.status === "no_match" ? "no_match" : "unavailable";
  const topConfidence = candidateValues[0]?.confidence ?? parsed.result.confidence;
  logMatchMetrics(finalStatus, provider, parsed.inputTokens, parsed.outputTokens, candidateValues.length, startedAt);
  await updateSuggestion(suggestion.id, accountId, {
    status: finalStatus,
    confidence: topConfidence,
    candidateCount: candidateValues.length,
    modelVersion: provider.model,
    keySource: provider.kind === "anthropic" ? provider.source : "shared",
    failureCode: finalStatus === "unavailable" ? "falco_unavailable" : null,
    generatedAt: now,
    expiresAt: new Date(now.getTime() + SUGGESTION_TTL_MS),
  }, candidateValues);
  return getCrmCallSuggestion(accountId, callId);
}

export type CrmCallMatchDecisionResult = "linked" | "already_linked" | "rejected" | "dismissed" | "not_found" | "conflict" | "expired";

export async function confirmCrmCallMatch(accountId: string, actorUserId: string, callId: string, suggestionId: string, leadId: string): Promise<CrmCallMatchDecisionResult> {
  return db.transaction(async (tx) => {
    const [suggestion] = await tx
      .select()
      .from(crmCallMatchSuggestions)
      .where(and(eq(crmCallMatchSuggestions.id, suggestionId), eq(crmCallMatchSuggestions.accountId, accountId), eq(crmCallMatchSuggestions.salesCallId, callId)))
      .limit(1);
    if (!suggestion) return "not_found";
    if (isExpired(suggestion)) return "expired";

    const [candidate] = await tx
      .select({ confidence: crmCallMatchCandidates.confidence })
      .from(crmCallMatchCandidates)
      .where(and(eq(crmCallMatchCandidates.suggestionId, suggestionId), eq(crmCallMatchCandidates.leadId, leadId)))
      .limit(1);
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    const [call] = await tx.select({ id: salesCalls.id, scheduledAt: salesCalls.scheduledAt }).from(salesCalls).where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId))).limit(1);
    if (!candidate || !lead || !call) return "not_found";

    const [existing] = await tx
      .select()
      .from(crmCallLinks)
      .where(and(eq(crmCallLinks.accountId, accountId), eq(crmCallLinks.salesCallId, callId)))
      .limit(1);
    if (existing) {
      if (existing.leadId !== leadId) return "conflict";
      await tx.update(crmCallMatchSuggestions).set({ status: "accepted", decision: "accepted", decidedByUserId: actorUserId, decidedAt: new Date(), updatedAt: new Date() }).where(eq(crmCallMatchSuggestions.id, suggestionId));
      return "already_linked";
    }

    const now = new Date();
    const [inserted] = await tx
      .insert(crmCallLinks)
      .values({ accountId, leadId, salesCallId: callId, source: "app", confidence: candidate.confidence, acceptedSuggestionId: suggestionId, linkedByUserId: actorUserId, linkedAt: now })
      .onConflictDoNothing({ target: [crmCallLinks.accountId, crmCallLinks.salesCallId] })
      .returning({ id: crmCallLinks.id });
    if (!inserted) return "conflict";

    await tx
      .update(crmCallMatchSuggestions)
      .set({ status: "accepted", decision: "accepted", decidedByUserId: actorUserId, decidedAt: now, updatedAt: now })
      .where(eq(crmCallMatchSuggestions.id, suggestionId));
    await tx
      .insert(crmLeadEvents)
      .values({
        accountId,
        leadId,
        actorUserId,
        type: "match_confirmed",
        source: "app",
        sourceEventKey: `call-match:${callId}:${suggestionId}`,
        occurredAt: call.scheduledAt,
        capturedAt: now,
        metadata: { salesCallId: callId, suggestionId, candidateLeadId: leadId, confidence: candidate.confidence, method: "falco" },
      })
      .onConflictDoNothing();
    return "linked";
  });
}

export async function decideCrmCallMatchSuggestion(accountId: string, actorUserId: string, suggestionId: string, decision: Exclude<CrmCallMatchDecision, "accepted">): Promise<CrmCallMatchDecisionResult> {
  return db.transaction(async (tx) => {
    const [suggestion] = await tx
      .select({ id: crmCallMatchSuggestions.id, salesCallId: crmCallMatchSuggestions.salesCallId })
      .from(crmCallMatchSuggestions)
      .where(and(eq(crmCallMatchSuggestions.id, suggestionId), eq(crmCallMatchSuggestions.accountId, accountId), isNull(crmCallMatchSuggestions.decidedAt)))
      .limit(1);
    if (!suggestion) return "conflict";

    const [existingLink] = await tx
      .select({ id: crmCallLinks.id })
      .from(crmCallLinks)
      .where(and(eq(crmCallLinks.accountId, accountId), eq(crmCallLinks.salesCallId, suggestion.salesCallId)))
      .limit(1);
    if (existingLink) return "conflict";

    const status = decision === "rejected" ? "rejected" : "dismissed";
    const [updated] = await tx
      .update(crmCallMatchSuggestions)
      .set({ status, decision, decidedByUserId: actorUserId, decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(crmCallMatchSuggestions.id, suggestionId), eq(crmCallMatchSuggestions.accountId, accountId), isNull(crmCallMatchSuggestions.decidedAt)))
      .returning({ id: crmCallMatchSuggestions.id });
    return updated ? decision : "conflict";
  });
}
