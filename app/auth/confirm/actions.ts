"use server";

import { ensureUserRow } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthDestination } from "@/lib/team/context";

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

  return getPostAuthDestination(userId);
}
