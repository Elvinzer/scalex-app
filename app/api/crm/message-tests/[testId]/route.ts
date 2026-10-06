import { NextResponse, type NextRequest } from "next/server";

import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { getAuthenticatedCrmApiAccess } from "@/lib/crm/http-access";
import {
  getCrmMessageAbTest,
  isCrmMessageAbTestUniqueViolation,
  updateCrmMessageAbTestStatus,
} from "@/lib/crm/message-ab-tests";
import { crmMessageAbTestActionSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ testId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const identity = await getAuthenticatedCrmApiAccess("crm:view");
  if ("error" in identity) return NextResponse.json({ error: identity.error }, { status: identity.error === "unauthorized" ? 401 : 403 });
  const { testId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const test = await getCrmMessageAbTest(identity.access.accountId, testId);
  return test ? NextResponse.json({ test }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const identity = await getAuthenticatedCrmApiAccess("crm:manage-message-tests");
  if ("error" in identity) return NextResponse.json({ error: identity.error }, { status: identity.error === "unauthorized" ? 401 : 403 });
  if (isRateLimited(`crm-message-tests-update:${identity.userId}:${getClientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { testId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = crmMessageAbTestActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_action" }, { status: 422 });

  try {
    const result = await updateCrmMessageAbTestStatus(identity.access.accountId, testId, parsed.data.action);
    if (result.state === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (result.state === "invalid_transition") return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
    if (result.state === "channel_occupied") return NextResponse.json({ error: "active_test_exists" }, { status: 409 });
    return "test" in result ? NextResponse.json({ test: result.test }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    if (isCrmMessageAbTestUniqueViolation(error)) return NextResponse.json({ error: "active_test_exists" }, { status: 409 });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
