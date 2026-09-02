import { NextResponse } from "next/server";

import { getAuthIdentity } from "@/lib/auth/request";
import { ensureUserRow } from "@/lib/current-user";
import { createCrmExtensionSession } from "@/lib/crm/extension-session";
import { readCrmExtensionAuthQuery } from "@/lib/crm/extension-auth";
import { requireCrmAccess } from "@/lib/crm/access";

export const runtime = "nodejs";

function extensionRedirect(query: { redirect_uri: string; state: string }, error?: string, token?: string): NextResponse {
  const target = new URL(query.redirect_uri);
  target.searchParams.set("state", query.state);
  if (token) target.searchParams.set("token", token);
  if (error) target.searchParams.set("error", error);
  return NextResponse.redirect(target);
}

function signInRedirect(request: Request, query: { redirect_uri: string; state: string }): NextResponse {
  const target = new URL("/sign-in", request.url);
  target.searchParams.set("redirect_uri", query.redirect_uri);
  target.searchParams.set("state", query.state);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = readCrmExtensionAuthQuery(requestUrl.searchParams);
  if (!query) return NextResponse.json({ error: "invalid_extension_auth_request" }, { status: 400 });

  const identity = await getAuthIdentity();
  if (!identity) return signInRedirect(request, query);

  if (identity.email) await ensureUserRow(identity.userId, identity.email);
  const access = await requireCrmAccess(identity.userId);
  if (!access) return extensionRedirect(query, "crm_unavailable");

  const token = createCrmExtensionSession(access.userId, access.accountId);
  if (!token) return extensionRedirect(query, "extension_not_configured");
  return extensionRedirect(query, undefined, token);
}
