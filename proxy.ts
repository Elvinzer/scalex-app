import { NextResponse, type NextRequest } from "next/server";

import {
  getLocalSuperuserConfig,
  hostnameFromHostHeader,
  LOCAL_SUPERUSER_COOKIE,
  LOCAL_SUPERUSER_COOKIE_VALUE,
  LOCAL_SUPERUSER_DISABLED_COOKIE,
  LOCAL_SUPERUSER_DISABLED_COOKIE_VALUE,
  isLocalSuperuserDisabled,
} from "@/lib/auth/local-superuser";
import { BUSINESS_HEADER, PATHNAME_HEADER, SEARCH_HEADER, businessFromReferer, businessHref, businessIdSchema, getBusinessIdFromPath, isBusinessAppPath, stripBusinessPrefix } from "@/lib/businesses/routing";
import { updateSession } from "@/lib/supabase/middleware";

async function authenticateRequest(request: NextRequest) {
  const localSuperuser = getLocalSuperuserConfig(hostnameFromHostHeader(request.headers.get("host")));
  const isLocalSignOut = request.nextUrl.pathname === "/api/auth/local/sign-out";
  const enableLocalSuperuser = request.nextUrl.searchParams.get("localSuperuser") === "on";
  const isInviteFlow =
    request.nextUrl.pathname.startsWith("/invite/") ||
    (request.nextUrl.pathname === "/auth/callback" && request.nextUrl.searchParams.has("invite"));
  const localSuperuserDisabled = isLocalSuperuserDisabled(
    request.cookies.get(LOCAL_SUPERUSER_DISABLED_COOKIE)?.value
  );

  if (localSuperuser && isInviteFlow && !isLocalSignOut && !enableLocalSuperuser) {
    request.cookies.delete(LOCAL_SUPERUSER_COOKIE);
    request.cookies.set(LOCAL_SUPERUSER_DISABLED_COOKIE, LOCAL_SUPERUSER_DISABLED_COOKIE_VALUE);
    const response = await updateSession(request);
    response.cookies.set(LOCAL_SUPERUSER_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    response.cookies.set(LOCAL_SUPERUSER_DISABLED_COOKIE, LOCAL_SUPERUSER_DISABLED_COOKIE_VALUE, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    return response;
  }

  if (localSuperuser && !isLocalSignOut && (!localSuperuserDisabled || enableLocalSuperuser)) {
    if (enableLocalSuperuser) request.cookies.delete(LOCAL_SUPERUSER_DISABLED_COOKIE);
    request.cookies.set(LOCAL_SUPERUSER_COOKIE, LOCAL_SUPERUSER_COOKIE_VALUE);
    const response = NextResponse.next({ request });
    response.cookies.set(LOCAL_SUPERUSER_COOKIE, LOCAL_SUPERUSER_COOKIE_VALUE, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    if (enableLocalSuperuser) {
      response.cookies.set(LOCAL_SUPERUSER_DISABLED_COOKIE, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure: false,
      });
    }
    return response;
  }

  return await updateSession(request);
}

// Scope comes only from the requested URL or its same-origin initiating tab.
// Always overwrite browser-supplied context headers before server code sees them.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const explicitPath = getBusinessIdFromPath(path);
  const internalPath = stripBusinessPrefix(path);
  if (path.startsWith("/b/") && !explicitPath) return NextResponse.json({ error: "invalid_business" }, { status: 400 });
  const queryValue = explicitPath || isBusinessAppPath(internalPath) || internalPath.startsWith("/api/billing/")
    ? request.nextUrl.searchParams.get("business") : null;
  const query = queryValue === null ? null : businessIdSchema.safeParse(queryValue);
  if (query && !query.success) return NextResponse.json({ error: "invalid_business" }, { status: 400 });
  if (explicitPath && query?.success && explicitPath !== query.data) {
    return NextResponse.json({ error: "business_context_conflict" }, { status: 400 });
  }
  const selected = explicitPath ?? (query?.success ? query.data : null) ?? businessFromReferer(request.headers.get("referer"), request.nextUrl.origin);
  request.headers.delete(BUSINESS_HEADER);
  request.headers.delete(PATHNAME_HEADER);
  request.headers.delete(SEARCH_HEADER);
  if (selected) request.headers.set(BUSINESS_HEADER, selected);
  request.headers.set(PATHNAME_HEADER, internalPath);
  request.headers.set(SEARCH_HEADER, request.nextUrl.search);
  if (!explicitPath && selected && request.method === "GET" && isBusinessAppPath(path) && !path.startsWith("/businesses")) {
    const target = new URL(businessHref(selected, `${path}${request.nextUrl.search}`), request.url);
    return NextResponse.redirect(target);
  }
  const response = await authenticateRequest(request);
  if (!explicitPath) return response;
  const internalUrl = request.nextUrl.clone();
  internalUrl.pathname = internalPath;
  const rewritten = NextResponse.rewrite(internalUrl, { request: { headers: request.headers } });
  for (const [key, value] of response.headers) {
    if (!key.startsWith("x-middleware-") && key !== "set-cookie") rewritten.headers.set(key, value);
  }
  for (const cookie of response.cookies.getAll()) rewritten.cookies.set(cookie);
  return rewritten;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg).*)"],
};
