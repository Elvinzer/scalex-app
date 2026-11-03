import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAuthIdentity } from "@/lib/auth/request";
import { requireCrmAccess } from "@/lib/crm/access";
import { createCrmExtensionSession } from "@/lib/crm/extension-session";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const identity = await getAuthIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isRateLimited(`crm-extension-session:${identity.userId}`, 20)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body: unknown = request.body ? await request.json().catch(() => null) : {};
  const parsed = z.object({ businessId: z.string().uuid().optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_business" }, { status: 400 });
  const access = await requireCrmAccess(identity.userId, "crm:view", parsed.data.businessId);
  if (!access) return NextResponse.json({ error: "crm_unavailable" }, { status: 403 });
  const token = createCrmExtensionSession(identity.userId, access.accountId);
  if (!token) return NextResponse.json({ error: "extension_not_configured" }, { status: 503 });
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  return NextResponse.json({ data: { extensionToken: token, expiresAt, businessId: access.accountId, businessName: access.businessName }, token, expiresAt, expiresInSeconds: 900, businessId: access.accountId, businessName: access.businessName });
}
