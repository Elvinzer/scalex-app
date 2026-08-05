import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingEvents, subscriptionPlans, subscriptions, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export type NativeBookingEntitlements = {
  enabled: boolean;
  maxEvents: number | null;
};

async function isPlatformAdmin(accountId: string): Promise<boolean> {
  const [adminRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, accountId)).limit(1);
  return Boolean(adminRow && isAdminEmail(adminRow.email));
}

// Single point of truth for "can this account use team members" — read both
// at invite time and on every request a team member makes (lib/team/context.ts),
// so a lapsed subscription cuts access immediately, not just future invites.
// Same "single point of config, easy to re-tune per tier later" philosophy
// as the shared-key quota, see lib/agent/quota.ts.
//
// Founders' own accounts always report an active/unlimited plan — no real
// subscriptions row needed. lib/team/context.ts already bypasses this
// function entirely for admins, but /settings/equipe and
// /settings/facturation call it directly, so the bypass is duplicated here.
export async function hasActiveTeamSubscription(accountId: string): Promise<boolean> {
  if (await isPlatformAdmin(accountId)) return true;

  const [row] = await db
    .select({
      status: subscriptions.status,
      features: subscriptionPlans.features,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(subscriptions.userId, accountId))
    .limit(1);

  if (!row || !ACTIVE_STATUSES.has(row.status)) return false;
  const features = row.features as { teamMembersEnabled?: boolean };
  return features.teamMembersEnabled === true;
}

// "Does this account have ANY active/trialing subscription" — no feature-flag
// requirement, unlike hasActiveTeamSubscription above. Used to gate features
// that any paid tier unlocks (the iClosed call tracking: "même le 1er palier
// le permet"). Same admin bypass and ACTIVE_STATUSES source of truth.
export async function hasActiveSubscription(accountId: string): Promise<boolean> {
  if (await isPlatformAdmin(accountId)) return true;

  const [row] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.userId, accountId))
    .limit(1);

  return Boolean(row && ACTIVE_STATUSES.has(row.status));
}

export async function getNativeBookingEntitlements(accountId: string): Promise<NativeBookingEntitlements> {
  if (await isPlatformAdmin(accountId)) return { enabled: true, maxEvents: null };

  const [row] = await db
    .select({ status: subscriptions.status, features: subscriptionPlans.features })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(subscriptions.userId, accountId))
    .limit(1);

  if (!row || !ACTIVE_STATUSES.has(row.status)) return { enabled: false, maxEvents: 0 };
  const features = row.features as { nativeBookingEnabled?: boolean; maxBookingEvents?: number | null };
  return {
    enabled: features.nativeBookingEnabled === true,
    maxEvents: features.maxBookingEvents ?? null,
  };
}

export async function getNativeBookingUsage(accountId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(nativeBookingEvents)
    .where(eq(nativeBookingEvents.userId, accountId));
  return Number(row?.count ?? 0);
}

export async function canCreateNativeBookingEvent(accountId: string): Promise<{
  allowed: boolean;
  reason: "disabled" | "limit" | null;
  entitlements: NativeBookingEntitlements;
  usage: number;
}> {
  const [entitlements, usage] = await Promise.all([
    getNativeBookingEntitlements(accountId),
    getNativeBookingUsage(accountId),
  ]);

  if (!entitlements.enabled) return { allowed: false, reason: "disabled", entitlements, usage };
  if (entitlements.maxEvents !== null && usage >= entitlements.maxEvents) {
    return { allowed: false, reason: "limit", entitlements, usage };
  }
  return { allowed: true, reason: null, entitlements, usage };
}
