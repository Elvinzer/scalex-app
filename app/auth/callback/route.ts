import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureUserRow } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { getAccountContext } from "@/lib/team/context";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite");

  const supabase = await createClient();
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  // A team member accepting an invite never goes through the
  // business-owner onboarding wizard — see app/invite/[token]/page.tsx.
  if (inviteToken) {
    return NextResponse.redirect(`${origin}/invite/${inviteToken}`);
  }

  // Checked directly here instead of always routing through /onboarding
  // first (which used to rely on that page's own redirect-if-completed
  // check to bounce existing users onward) — onboarding is a once-per-new-account
  // flow, an existing account should never even transiently land on it.
  const { data } = await supabase.auth.getClaims();
  let destination = "/onboarding";
  if (data?.claims) {
    const userId = data.claims.sub as string;
    const email = data.claims.email;
    if (typeof email === "string") {
      await ensureUserRow(userId, email);
    }
    // Same resolution as lib/current-user.ts's getCurrentUser: a team
    // member's onboarding status follows the ACCOUNT (owner) they belong
    // to, not their own row — the wizard is about the business, not the
    // individual signing in.
    const context = await getAccountContext(userId);
    const accountId = context?.accountId ?? userId;
    const [user] = await db.select({ onboardingCompleted: users.onboardingCompleted }).from(users).where(eq(users.id, accountId)).limit(1);
    destination = user?.onboardingCompleted ? "/dashboard" : "/onboarding";
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
