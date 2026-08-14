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
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg).*)"],
};
