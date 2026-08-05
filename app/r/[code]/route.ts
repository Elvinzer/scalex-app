import { NextResponse, type NextRequest } from "next/server";

import { getReferralCodeByCode } from "@/lib/referrals/queries";
import {
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
  referralCodeSchema,
} from "@/lib/referrals/schema";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const parsedCode = referralCodeSchema.safeParse(rawCode);
  const destination = new URL("/sign-in", request.url);

  if (!parsedCode.success || isRateLimited(`referral-link:${getClientIp(request)}`, 60)) {
    return NextResponse.redirect(destination);
  }

  const code = await getReferralCodeByCode(parsedCode.data);
  if (!code) return NextResponse.redirect(destination);

  const response = NextResponse.redirect(destination);
  // First-touch attribution: a later shared link must not silently replace a
  // valid referral already stored in this browser before account creation.
  if (!request.cookies.get(REFERRAL_COOKIE_NAME)?.value) {
    response.cookies.set(REFERRAL_COOKIE_NAME, code.code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }
  return response;
}
