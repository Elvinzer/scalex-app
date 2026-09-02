import { NextResponse, type NextRequest } from "next/server";

import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { readCrmExtensionBody } from "@/lib/crm/extension-http";
import { getBusinessProfile } from "@/lib/business/queries";
import { getCrmExtensionAccess } from "@/lib/crm/extension-session";
import { getCrmSetterForActor, resolveCrmProfile } from "@/lib/crm/queries";
import { captureProfileSchema } from "@/lib/crm/schemas";
import { normalizeCapturedProfile } from "@/lib/crm/normalization";
import { CRM_LEAD_SOURCES, CRM_LEAD_STAGES } from "@/lib/crm/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await getCrmExtensionAccess(request);
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isRateLimited(`crm-extension-resolve:${access.userId}:${getClientIp(request)}`, 60, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const bodyResult = await readCrmExtensionBody(request);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.reason === "too_large" ? "payload_too_large" : "invalid_request" }, { status: bodyResult.reason === "too_large" ? 413 : 400 });
  const body = bodyResult.body;
  const parsed = captureProfileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
  const profile = normalizeCapturedProfile(parsed.data);
  if (!profile) return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
  const resolution = await resolveCrmProfile(access.accountId, profile);
  if (resolution.kind !== "unknown") return NextResponse.json({ data: { state: resolution.kind, ...resolution }, resolution });
  const [businessProfile, responsible] = await Promise.all([
    getBusinessProfile(access.accountId),
    getCrmSetterForActor(access.accountId, access.userId),
  ]);
  const offers = businessProfile.sales.offers.map(({ id, name }) => ({ id, name }));
  const qualification = {
    offers,
    defaultOfferId: offers.length === 1 ? offers[0].id : null,
    sources: CRM_LEAD_SOURCES,
    stages: CRM_LEAD_STAGES,
    responsible,
  };
  return NextResponse.json({ data: { state: resolution.kind, ...resolution, qualification }, resolution, qualification });
}
