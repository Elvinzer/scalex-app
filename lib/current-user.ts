import { eq } from "drizzle-orm";
import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { BUSINESS_HEADER, PATHNAME_HEADER, SEARCH_HEADER, isBusinessAppPath } from "@/lib/businesses/routing";
import { createBusiness } from "@/lib/businesses/queries";
import { businessHref } from "@/lib/businesses/routing";

import { db } from "@/db";
import { businesses, users } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";
import { track } from "@/lib/analytics";
import { withDatabaseReadRetry } from "@/lib/perf/database-retry";
import { getInFlight } from "@/lib/perf/in-flight";
import { getAccountContext } from "@/lib/team/context";
import { captureReferralAttribution } from "@/lib/referrals/attribution";

// Personal identity and operational business data are deliberately separate.
// Business views join owner contact details without creating artificial users.
async function fetchUserById(userId: string) {
  const [user] = await withDatabaseReadRetry(
    () => db.select().from(users).where(eq(users.id, userId)).limit(1),
    { operation: "current-user", timeoutMs: 8_000 },
  );
  return user;
}

const inFlightUsers = new Map<string, Promise<Awaited<ReturnType<typeof fetchUserById>>>>();

export const getUserById = cache(async (userId: string) => {
  return getInFlight(inFlightUsers, userId, () => withDatabaseReadRetry(
    () => fetchUserById(userId),
    { operation: "user-by-id", timeoutMs: 10_000, attempts: 1 },
  ));
});

export const getBusinessAccountById = cache(async (businessId: string) => {
  const [row] = await db.select({ business: businesses, owner: users }).from(businesses)
    .innerJoin(users, eq(businesses.ownerUserId, users.id)).where(eq(businesses.id, businessId)).limit(1);
  if (!row) return undefined;
  return { ...row.owner, ...row.business, email: row.owner.email, locale: row.owner.locale,
    displayName: row.owner.displayName, avatarUrl: row.owner.avatarUrl };
});

export const getCurrentUser = cache(async (options: { allowSuspended?: boolean } = {}) => {
  const identity = await getAuthIdentity();
  if (!identity) redirect("/sign-in");
  const { userId } = identity;
  const context = await getAccountContext(userId, { allowSuspended: true });
  if (!context) redirect("/businesses");
  if (!options.allowSuspended && !context.entitlement.active) {
    redirect(context.isOwner ? businessHref(context.accountId, "/settings/facturation") : "/businesses");
  }
  const requestHeaders = await headers();
  const path = requestHeaders.get(PATHNAME_HEADER);
  if (!requestHeaders.has(BUSINESS_HEADER) && path && isBusinessAppPath(path) && !path.startsWith("/businesses")) {
    redirect(businessHref(context.accountId, `${path}${requestHeaders.get(SEARCH_HEADER) ?? ""}`));
  }
  const [user, currentUser] = await Promise.all([getBusinessAccountById(context.accountId), getUserById(userId)]);
  if (!user || !currentUser) redirect("/businesses");
  return { userId, accountId: context.accountId, businessId: context.accountId, user, currentUser };
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
  const [existing] = await withDatabaseReadRetry(
    () => db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    { operation: "ensure-user-row", timeoutMs: 8_000 },
  );
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
      const businessId = await createBusiness(userId, email.split("@")[0].slice(0, 100));
      await captureReferralAttribution(businessId);
    }
  }
  return { isNewUser };
}
