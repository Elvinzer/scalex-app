import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { track } from "@/lib/analytics";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

// The Monday email's single CTA points here first (with UTM params) purely
// so the click is tracked server-side before redirecting to the real
// destination — no auth check: this is a read-only analytics beacon, not a
// mutation, so a spoofed `u` param only pollutes one click count, nothing
// sensitive is exposed or changed.
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  if (isRateLimited(`weekly-email-click:${getClientIp(request)}`, 30)) {
    return NextResponse.redirect(new URL("/dashboard?report=1", origin));
  }

  const uuidSchema = z.string().uuid();
  const userId = uuidSchema.safeParse(request.nextUrl.searchParams.get("u"));
  const initiativeId = uuidSchema.safeParse(
    request.nextUrl.searchParams.get("initiative"),
  );

  if (userId.success) {
    after(() =>
      track("weekly_brief_email_clicked", userId.data, {
        utm_source: request.nextUrl.searchParams.get("utm_source"),
        utm_campaign: request.nextUrl.searchParams.get("utm_campaign"),
      })
    );
  }

  const destination = initiativeId.success
    ? `/diagnostic-app#insight-${initiativeId.data}`
    : "/dashboard?report=1";
  return NextResponse.redirect(new URL(destination, origin));
}
