import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { teamMemberRoles, teamMembers, teamRoles, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveTeamSubscription } from "@/lib/billing/plan-gate";
import type { PermissionKey } from "@/lib/team/permissions";

export type AccountContext =
  | { isOwner: true; accountId: string; permissions: "all" }
  | { isOwner: false; accountId: string; permissions: Set<string> };

// Resolves which account a Supabase Auth user id acts on behalf of, and
// with what permissions. No separate "accounts" table: an account IS its
// owner's users.id (see db/schema.ts's team* tables comment). A user with no
// active team membership is always the owner of their own account — today's
// behavior, unchanged. Memoized per request (React's cache()) so a layout +
// page rendering the same request only resolves this once; Server Actions
// are separate invocations and re-resolve fresh, which is fine — it's a
// single indexed query.
//
// Returns null if the resolved account's Scale X subscription has lapsed:
// team members lose access immediately, not just future invites, per
// CLAUDE.md ("l'infopreneur devra forcément avoir un abonnement"). Never
// null for an owner — the gate only applies to delegated access.
//
// Founders (ADMIN_EMAILS, see lib/admin.ts) always get unconditional full
// access to their own account — never gated by role permissions, and never
// blocked by a lapsed/missing subscription (see the matching bypass in
// lib/billing/plan-gate.ts's hasActiveTeamSubscription, for the couple of
// call sites — /settings/equipe, /settings/facturation — that check the
// subscription directly rather than through this function).
export const getAccountContext = cache(async (userId: string): Promise<AccountContext | null> => {
  const [[userRow], [membership]] = await Promise.all([
    db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({ id: teamMembers.id, accountId: teamMembers.accountId })
      .from(teamMembers)
      .where(and(eq(teamMembers.memberUserId, userId), eq(teamMembers.status, "active")))
      .orderBy(desc(teamMembers.joinedAt))
      .limit(1),
  ]);

  if (userRow && isAdminEmail(userRow.email)) {
    return { isOwner: true, accountId: userId, permissions: "all" };
  }

  if (!membership) {
    return { isOwner: true, accountId: userId, permissions: "all" };
  }

  const subscriptionActive = await hasActiveTeamSubscription(membership.accountId);
  if (!subscriptionActive) {
    return null;
  }

  const roles = await db
    .select({ permissions: teamRoles.permissions })
    .from(teamMemberRoles)
    .innerJoin(teamRoles, eq(teamMemberRoles.roleId, teamRoles.id))
    .where(eq(teamMemberRoles.teamMemberId, membership.id));

  const permissions = new Set<string>();
  for (const role of roles) {
    for (const key of role.permissions as string[]) permissions.add(key);
  }

  return { isOwner: false, accountId: membership.accountId, permissions };
});

// Used by every page/Server Action gated to a specific role-grantable
// section — null means "redirect" (page) or "{ error }" (Server Action) at
// the call site, never thrown, so callers stay in control of the UX.
export async function requirePermission(
  userId: string,
  key: PermissionKey
): Promise<{ accountId: string } | null> {
  const context = await getAccountContext(userId);
  if (!context) return null;
  if (context.isOwner) return { accountId: context.accountId };
  return context.permissions.has(key) ? { accountId: context.accountId } : null;
}

// Used by everything that stays account-owner-only regardless of role:
// /settings (BYOK key, Stripe Connect), /settings/facturation,
// /settings/equipe, /settings/roles.
export async function requireOwner(userId: string): Promise<{ accountId: string } | null> {
  const context = await getAccountContext(userId);
  if (!context) return null;
  return context.isOwner ? { accountId: context.accountId } : null;
}

// Page-only convenience (Server Components): redirects instead of returning
// null, so a gated page.tsx doesn't need to repeat the same `if (!access)
// redirect(...)` boilerplate. Server Actions must NOT use these — they need
// the `{ error }` shape, so they call requirePermission/requireOwner
// directly. redirect() throws (Next.js types it `never`), so TS narrows
// `access` to non-null on the line below.
export async function requirePermissionOrRedirect(
  userId: string,
  key: PermissionKey,
  redirectTo = "/dashboard"
): Promise<{ accountId: string }> {
  const access = await requirePermission(userId, key);
  if (!access) redirect(redirectTo);
  return access;
}

export async function requireOwnerOrRedirect(userId: string, redirectTo = "/dashboard"): Promise<{ accountId: string }> {
  const access = await requireOwner(userId);
  if (!access) redirect(redirectTo);
  return access;
}
