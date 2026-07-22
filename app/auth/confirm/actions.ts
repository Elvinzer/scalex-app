"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureUserRow } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { getAccountContext } from "@/lib/team/context";

// Called once the client SDK has picked up the session from the URL hash
// (see confirm-page.tsx's comment — only the browser can read that
// fragment). Checked here instead of always sending every login through
// /onboarding first: onboarding is a once-per-new-account flow, an existing
// account should never even transiently land on it.
export async function resolvePostAuthDestination(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return "/sign-in";

  const userId = data.claims.sub as string;
  const email = data.claims.email;
  if (typeof email === "string") {
    await ensureUserRow(userId, email);
  }

  // Same resolution as lib/current-user.ts's getCurrentUser: a team
  // member's onboarding status follows the ACCOUNT (owner) they belong to.
  const context = await getAccountContext(userId);
  const accountId = context?.accountId ?? userId;
  const [user] = await db.select({ onboardingCompleted: users.onboardingCompleted }).from(users).where(eq(users.id, accountId)).limit(1);

  return user?.onboardingCompleted ? "/dashboard" : "/onboarding";
}
