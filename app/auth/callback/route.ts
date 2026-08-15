import { NextResponse } from "next/server";

import { ensureUserRow } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthDestination } from "@/lib/team/context";
import { z } from "zod";

const authCallbackQuerySchema = z.object({
  code: z.string().trim().min(1).max(1024).optional(),
  invite: z.string().trim().min(1).max(256).optional(),
  error: z.string().trim().min(1).max(128).optional(),
  next: z.string().trim().startsWith("/").max(512).optional(),
});

function redirectToSignIn(request: Request) {
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("error", "auth_callback");
  return NextResponse.redirect(signInUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const parsedQuery = authCallbackQuerySchema.safeParse(Object.fromEntries(requestUrl.searchParams.entries()));
  if (!parsedQuery.success || parsedQuery.data.error || !parsedQuery.data.code) {
    return redirectToSignIn(request);
  }

  const { code, invite: inviteToken, next } = parsedQuery.data;

  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectToSignIn(request);
  } catch {
    return redirectToSignIn(request);
  }

  // A team member accepting an invite never goes through the
  // business-owner onboarding wizard — see app/invite/[token]/page.tsx.
  if (inviteToken) {
    return NextResponse.redirect(new URL(`/invite/${encodeURIComponent(inviteToken)}`, requestUrl.origin));
  }

  if (next && !next.startsWith("//")) {
    return NextResponse.redirect(new URL(next, requestUrl.origin));
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
    destination = await getPostAuthDestination(userId);
  }

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
