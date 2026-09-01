import { NextResponse } from "next/server";

import { getAuthIdentity } from "@/lib/auth/request";
import { requireCrmAccess } from "@/lib/crm/access";
import { createCrmExtensionSession } from "@/lib/crm/extension-session";

export const runtime = "nodejs";

export async function POST() {
  const identity = await getAuthIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const access = await requireCrmAccess(identity.userId);
  if (!access) return NextResponse.json({ error: "crm_unavailable" }, { status: 403 });
  const token = createCrmExtensionSession(identity.userId, access.accountId);
  if (!token) return NextResponse.json({ error: "extension_not_configured" }, { status: 503 });
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  return NextResponse.json({ data: { extensionToken: token, expiresAt }, token, expiresAt, expiresInSeconds: 900 });
}
