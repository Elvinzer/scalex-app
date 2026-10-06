import { NextResponse, type NextRequest } from "next/server";

import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { confirmCrmMessageAbTestSend } from "@/lib/crm/message-ab-tests";
import { getCrmExtensionAccess } from "@/lib/crm/extension-session";
import { readCrmExtensionBody } from "@/lib/crm/extension-http";
import { crmMessageAbTestSendConfirmationSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await getCrmExtensionAccess(request);
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isRateLimited(`crm-message-test-send:${access.userId}:${getClientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const bodyResult = await readCrmExtensionBody(request);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.reason === "too_large" ? "payload_too_large" : "invalid_request" }, { status: bodyResult.reason === "too_large" ? 413 : 400 });
  const parsed = crmMessageAbTestSendConfirmationSchema.safeParse(bodyResult.body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_assignment" }, { status: 422 });

  const result = await confirmCrmMessageAbTestSend(access.accountId, access.userId, parsed.data.assignmentId);
  if (result.state === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result.state === "test_ended") return NextResponse.json({ error: "test_ended" }, { status: 409 });
  if (result.state === "already_contacted") return NextResponse.json({ error: "already_contacted" }, { status: 409 });
  return "assignment" in result
    ? NextResponse.json({ assignment: result.assignment, alreadyConfirmed: result.state === "already_confirmed" })
    : NextResponse.json({ error: "not_found" }, { status: 404 });
}
