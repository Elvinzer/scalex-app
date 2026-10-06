import { NextResponse, type NextRequest } from "next/server";

import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { getAuthenticatedCrmApiAccess } from "@/lib/crm/http-access";
import {
  createCrmMessageAbTest,
  isCrmMessageAbTestUniqueViolation,
  listCrmMessageAbTests,
} from "@/lib/crm/message-ab-tests";
import { crmMessageAbTestCreateSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";

export async function GET() {
  const identity = await getAuthenticatedCrmApiAccess("crm:view");
  if ("error" in identity) return NextResponse.json({ error: identity.error }, { status: identity.error === "unauthorized" ? 401 : 403 });
  const tests = await listCrmMessageAbTests(identity.access.accountId);
  return NextResponse.json({ tests });
}

export async function POST(request: NextRequest) {
  const identity = await getAuthenticatedCrmApiAccess("crm:manage-message-tests");
  if ("error" in identity) return NextResponse.json({ error: identity.error }, { status: identity.error === "unauthorized" ? 401 : 403 });
  if (isRateLimited(`crm-message-tests-create:${identity.userId}:${getClientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = crmMessageAbTestCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_test" }, { status: 422 });

  try {
    const test = await createCrmMessageAbTest({
      accountId: identity.access.accountId,
      actorUserId: identity.userId,
      ...parsed.data,
    });
    return NextResponse.json({ test }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CRM_MESSAGE_AB_TEST_IDEMPOTENCY_CONFLICT") {
      return NextResponse.json({ error: "idempotency_conflict" }, { status: 409 });
    }
    if (isCrmMessageAbTestUniqueViolation(error)) {
      return NextResponse.json({ error: "active_test_exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}
