import { NextResponse, type NextRequest } from "next/server";

import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { readCrmExtensionBody } from "@/lib/crm/extension-http";
import { getCrmExtensionAccess } from "@/lib/crm/extension-session";
import { searchCrmProfileCandidates } from "@/lib/crm/queries";
import { crmExtensionSearchSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await getCrmExtensionAccess(request);
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isRateLimited(`crm-extension-search:${access.userId}:${getClientIp(request)}`, 30, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const bodyResult = await readCrmExtensionBody(request);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.reason === "too_large" ? "payload_too_large" : "invalid_request" }, { status: bodyResult.reason === "too_large" ? 413 : 400 });
  const parsed = crmExtensionSearchSchema.safeParse(bodyResult.body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  const candidates = await searchCrmProfileCandidates(access.accountId, parsed.data.query);
  return NextResponse.json({ data: { accountId: access.accountId, candidates }, accountId: access.accountId, candidates });
}
