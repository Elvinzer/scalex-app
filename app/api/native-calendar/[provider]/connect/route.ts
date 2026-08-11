import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getNativeBookingEntitlements } from "@/lib/billing/plan-gate";
import { calendarAuthorizeUrl } from "@/lib/native-booking/calendar";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

type Provider = "google" | "outlook";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params;
  if (rawProvider !== "google" && rawProvider !== "outlook") {
    return NextResponse.redirect(new URL("/settings/calendars?calendar_error=provider", request.url));
  }
  const provider = rawProvider as Provider;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.redirect(new URL("/sign-in", request.url));

  const userId = data.claims.sub as string;
  const access = await requirePermission(userId, "ventes:rdv");
  if (!access || isRateLimited(`native-calendar-connect:${access.accountId}:${userId}`, 10)) {
    return NextResponse.redirect(new URL("/ventes/rdv", request.url));
  }
  const entitlements = await getNativeBookingEntitlements(access.accountId);
  if (!entitlements.enabled) return NextResponse.redirect(new URL("/ventes/rdv?calendar_error=plan", request.url));

  try {
    const state = randomBytes(24).toString("hex");
    const redirectUri = new URL(`/api/native-calendar/${provider}/callback`, request.url).toString();
    const returnTo = request.nextUrl.searchParams.get("returnTo") === "/settings/calendars" ? "/settings/calendars" : "/ventes/rdv";
    const response = NextResponse.redirect(calendarAuthorizeUrl(provider, redirectUri, state));
    response.cookies.set("native_calendar_oauth_state", `${provider}:${state}:${userId}:${returnTo}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("Native calendar connect not configured", error);
    return NextResponse.redirect(new URL(`/settings/calendars?calendar_error=not_configured&provider=${provider}`, request.url));
  }
}
