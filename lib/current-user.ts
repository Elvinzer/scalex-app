import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { getAccountContext } from "@/lib/team/context";

// Shared by every (app) page: the auth guard in app/(app)/layout.tsx
// already ensures a session exists, so this trusts the claims are present.
//
// `userId` is always the logged-in Supabase Auth user (who you are).
// `accountId` is who you act on behalf of — the owner's id for a team
// member, same as userId for an owner (today's only case, unchanged
// behavior). `user` is the ACCOUNT's row (business context: sector, BYOK
// key, etc.) — for a team member this is deliberately the owner's row, not
// their own, since the business belongs to the account, not the individual.
// Callers that write account-scoped data must use accountId, not userId;
// callers that record "who did this" (e.g. enteredByUserId) use userId.
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data!.claims.sub as string;

  const context = await getAccountContext(userId);
  const accountId = context?.accountId ?? userId;

  const [user] = await db.select().from(users).where(eq(users.id, accountId)).limit(1);
  return { userId, accountId, user };
}

// Single source of truth for the "get the authenticated user's id or bail"
// check duplicated across every Server Action in the app. Two variants
// (throw vs. error-object) match the two return shapes those call sites
// already use, so migrating them is a pure import swap.
export async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    throw new Error("Session expirée, reconnecte-toi.");
  }
  return data.claims.sub as string;
}

export async function requireUserIdOrError(): Promise<string | { error: string }> {
  try {
    return await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }
}

// Called from both app/(app)/layout.tsx and app/onboarding/layout.tsx — the
// only two entry points a session can land on right after auth. No
// dedicated post-login server route exists (the Supabase email template
// establishes the session client-side, not through a route we control), so
// this idempotent upsert-or-skip is how the users row actually gets
// created. onConflictDoNothing + returning() is also how "signup" is
// detected precisely once: an empty return means the row already existed.
export async function ensureUserRow(userId: string, email: string): Promise<{ isNewUser: boolean }> {
  const [inserted] = await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoNothing({ target: users.id })
    .returning({ id: users.id });

  const isNewUser = Boolean(inserted);
  if (isNewUser) {
    await track("signup", userId);
  }
  return { isNewUser };
}
