import { NextResponse, type NextRequest } from "next/server";

import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { readCrmExtensionBody } from "@/lib/crm/extension-http";
import { getBusinessProfile } from "@/lib/business/queries";
import { getCrmExtensionAccess } from "@/lib/crm/extension-session";
import { confirmCrmProfileMatch, createCrmLead, resolveCrmProfile } from "@/lib/crm/queries";
import { crmCaptureCommandSchema } from "@/lib/crm/schemas";
import { normalizeCapturedProfile } from "@/lib/crm/normalization";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await getCrmExtensionAccess(request);
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isRateLimited(`crm-extension-capture:${access.userId}:${getClientIp(request)}`, 30, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const bodyResult = await readCrmExtensionBody(request);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.reason === "too_large" ? "payload_too_large" : "invalid_request" }, { status: bodyResult.reason === "too_large" ? 413 : 400 });
  const body = bodyResult.body;
  const parsed = crmCaptureCommandSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
  const profile = normalizeCapturedProfile(parsed.data.profile);
  if (!profile) return NextResponse.json({ error: "invalid_profile" }, { status: 400 });

  const resolution = await resolveCrmProfile(access.accountId, profile);
  if (parsed.data.decision === "confirm_match") {
    if (!parsed.data.candidateLeadId) return NextResponse.json({ error: "candidate_required" }, { status: 422 });
    const candidate = resolution.kind === "ambiguous" ? resolution.candidates.some((lead) => lead.id === parsed.data.candidateLeadId) : resolution.kind === "known" && resolution.lead.id === parsed.data.candidateLeadId;
    if (!candidate) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
    try {
      const lead = await confirmCrmProfileMatch(access.accountId, parsed.data.candidateLeadId, profile, access.userId, parsed.data.idempotencyKey);
      if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
      return NextResponse.json({ data: { leadId: lead.id, profileUrl: lead.canonicalProfileUrl, created: false, confirmed: true, crmUrl: new URL(request.url).origin }, leadId: lead.id, profileUrl: lead.canonicalProfileUrl, created: false, confirmed: true, crmUrl: new URL(request.url).origin });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error && error.message === "CRM_IDEMPOTENCY_CONFLICT" ? "idempotency_conflict" : "profile_conflict" }, { status: 409 });
    }
  }

  if (resolution.kind === "ambiguous" && !parsed.data.separateFromCandidates) return NextResponse.json({ error: "ambiguous_match", resolution }, { status: 409 });
  try {
    const requestedOfferId = parsed.data.qualification?.offerId ?? null;
    const offerId = requestedOfferId ?? await (async () => {
      const businessProfile = await getBusinessProfile(access.accountId);
      return businessProfile.sales.offers.length === 1 ? businessProfile.sales.offers[0].id : null;
    })();
    const result = await createCrmLead(access.accountId, { profile, actorUserId: access.userId, offerId, marketingSource: parsed.data.qualification?.source, stage: parsed.data.qualification?.stage, source: "extension", sourceEventKey: parsed.data.profile.sourceEventKey ?? null, idempotencyKey: parsed.data.idempotencyKey });
    return NextResponse.json({ data: { leadId: result.lead.id, profileUrl: result.lead.canonicalProfileUrl, created: result.created, crmUrl: new URL(request.url).origin }, leadId: result.lead.id, profileUrl: result.lead.canonicalProfileUrl, created: result.created, crmUrl: new URL(request.url).origin });
  } catch (error) {
    if (error instanceof Error && error.message === "CRM_IDEMPOTENCY_CONFLICT") return NextResponse.json({ error: "idempotency_conflict" }, { status: 409 });
    return NextResponse.json({ error: "capture_failed" }, { status: 500 });
  }
}
