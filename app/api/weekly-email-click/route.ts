import { NextResponse, type NextRequest } from "next/server";

import { track } from "@/lib/analytics";

// The Monday email's single CTA points here first (with UTM params) purely
// so the click is tracked server-side before redirecting to the real
// destination — no auth check: this is a read-only analytics beacon, not a
// mutation, so a spoofed `u` param only pollutes one click count, nothing
// sensitive is exposed or changed.
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("u");
  const origin = new URL(request.url).origin;

  if (userId) {
    await track("weekly_brief_email_clicked", userId, {
      utm_source: request.nextUrl.searchParams.get("utm_source"),
      utm_campaign: request.nextUrl.searchParams.get("utm_campaign"),
    });
  }

  return NextResponse.redirect(new URL("/dashboard?checkin=1", origin));
}
