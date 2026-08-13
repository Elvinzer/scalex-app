import { NextResponse, type NextRequest } from "next/server";

import {
  getLocalSuperuserConfig,
  hostnameFromHostHeader,
  LOCAL_SUPERUSER_COOKIE,
} from "@/lib/auth/local-superuser";

export async function POST(request: NextRequest) {
  if (!getLocalSuperuserConfig(hostnameFromHostHeader(request.headers.get("host")))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(LOCAL_SUPERUSER_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: false,
  });
  return response;
}
