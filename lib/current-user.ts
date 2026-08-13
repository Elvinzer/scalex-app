import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";
import { track } from "@/lib/analytics";
import { getInFlight } from "@/lib/perf/in-flight";
import { getAccountContext } from "@/lib/team/context";
import { captureReferralAttribution } from "@/lib/referrals/attribution";

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
// cache()-wrapped for the same reason as getAccountContext below (which
// this already calls, itself memoized) — layout.tsx and the page it wraps
// both call getCurrentUser() independently on every navigation; without
// this, that's a redundant `users` row fetch every time, on every page.
// Request-scoped row cache shared by the authenticated app chrome and the
// page being opened. Both need the same account row before rendering useful
// content, so keep one database read.
async function fetchUserById(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

const inFlightUsers = new Map<string, Promise<Awaited<ReturnType<typeof fetchUserById>>>>();

export const getUserById = cache(async (userId: string) => {
  return getInFlight(inFlightUsers, userId, () => fetchUserById(userId));
});

export const getCurrentUser = cache(async () => {
  const identity = await getAuthIdentity();
  if (!identity) throw new Error("Session expirée, reconnecte-toi.");
  const { userId } = identity;

  const context = await getAccountContext(userId);
  const accountId = context?.accountId ?? userId;

  const user = await getUserById(accountId);

  // `user` is the ACCOUNT owner's row (business data, integrations, BYOK key
  // — all account-scoped). `currentUser` is the logged-in person's own row,
  // which is what personal fields like displayName belong to: /settings'
  // updateProfile writes to claims.sub, not to accountId. For an owner the
  // two are the same row, so this costs no extra query in the common case.
  const currentUser =
    userId === accountId ? user : await getUserById(userId);

  return { userId, accountId, user, currentUser };
});

// Single source of truth for the "get the authenticated user's id or bail"
// check duplicated across every Server Action in the app. Two variants
// (throw vs. error-object) match the two return shapes those call sites
// already use, so migrating them is a pure import swap.
export async function requireUserId(): Promise<string> {
  const identity = await getAuthIdentity();
  if (!identity) {
    throw new Error("Session expirée, reconnecte-toi.");
  }
  return identity.userId;
}

export async function requireUserIdOrError(): Promise<string | { error: string }> {
  try {
    return await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }
}

// Called from the post-auth callback/confirmation and onboarding entry
// points. Normal app navigation only reads the row; it must not perform a
// write on every page render because a transient pooler error would turn a
// healthy existing session into a server error. The existence check also
// avoids an unnecessary INSERT for returning users.
export async function ensureUserRow(
  userId: string,
  email: string,
  options: { captureReferral?: boolean } = {}
): Promise<{ isNewUser: boolean }> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing) return { isNewUser: false };

  let inserted: { id: string } | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      [inserted] = await db
        .insert(users)
        .values({ id: userId, email })
        .onConflictDoNothing({ target: users.id })
        .returning({ id: users.id });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message.toUpperCase() : "";
      const transientConnectionError =
        message.includes("ECONNRESET") ||
        message.includes("CONNECTION RESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("EPIPE");
      if (!transientConnectionError || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }

  const isNewUser = Boolean(inserted);
  if (isNewUser) {
    await track("signup", userId);
    if (options.captureReferral !== false) {
      await captureReferralAttribution(userId);
    }
  }
  return { isNewUser };
}
