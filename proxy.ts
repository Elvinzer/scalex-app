import { NextResponse, type NextRequest } from "next/server";

import {
  getLocalSuperuserConfig,
  hostnameFromHostHeader,
  LOCAL_SUPERUSER_COOKIE,
  LOCAL_SUPERUSER_COOKIE_VALUE,
} from "@/lib/auth/local-superuser";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const localSuperuser = getLocalSuperuserConfig(hostnameFromHostHeader(request.headers.get("host")));
  const isLocalSignOut = request.nextUrl.pathname === "/api/auth/local/sign-out";

  if (localSuperuser && !isLocalSignOut) {
    request.cookies.set(LOCAL_SUPERUSER_COOKIE, LOCAL_SUPERUSER_COOKIE_VALUE);
    const response = NextResponse.next({ request });
    response.cookies.set(LOCAL_SUPERUSER_COOKIE, LOCAL_SUPERUSER_COOKIE_VALUE, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    return response;
  }

  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg).*)"],
};
