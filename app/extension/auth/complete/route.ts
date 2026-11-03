import { NextResponse } from "next/server";

import { getAuthIdentity } from "@/lib/auth/request";
import { ensureUserRow } from "@/lib/current-user";
import { createCrmExtensionSession } from "@/lib/crm/extension-session";
import { readCrmExtensionAuthQuery } from "@/lib/crm/extension-auth";
import { requireCrmAccess } from "@/lib/crm/access";
import { businessIdSchema } from "@/lib/businesses/routing";
import { isRateLimited } from "@/lib/rate-limit";

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
  if (!requestUrl.searchParams.has("businessId")) {
    const target = new URL("/extension/auth/select", request.url);
    target.searchParams.set("redirect_uri", query.redirect_uri);
    target.searchParams.set("state", query.state);
    return NextResponse.redirect(target);
  }
  const businessId = businessIdSchema.safeParse(requestUrl.searchParams.get("businessId"));
  if (!businessId.success || requestUrl.searchParams.getAll("businessId").length !== 1) return NextResponse.json({ error: "invalid_business" }, { status: 400 });
  if (isRateLimited(`crm-extension-complete:${identity.userId}`, 20)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const access = await requireCrmAccess(identity.userId, "crm:view", businessId.data);
  if (!access || access.accountId !== businessId.data) return extensionRedirect(query, "crm_unavailable");

  const token = createCrmExtensionSession(identity.userId, businessId.data);
  if (!token) return extensionRedirect(query, "extension_not_configured");
  const response = extensionRedirect(query, undefined, token);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
