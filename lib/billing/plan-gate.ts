import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingEvents, subscriptionPlans, subscriptions } from "@/db/schema";
import { getBusinessEntitlement, getBusinessMemberEntitlement } from "@/lib/businesses/entitlements";
import { parsePlanFeatures } from "@/lib/billing/plan-schema";

export type NativeBookingEntitlements = {
  enabled: boolean;
  maxEvents: number | null;
};

async function getFeatures(accountId: string) {
  const [row] = await db.select({ features: subscriptionPlans.features })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(subscriptions.userId, accountId)).limit(1);
  return parsePlanFeatures(row?.features);
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
  return (await getBusinessMemberEntitlement(accountId)).active;
}

// "Does this account have ANY active/trialing subscription" — no feature-flag
// requirement, unlike hasActiveTeamSubscription above. Used to gate features
// that any paid tier unlocks (the iClosed call tracking: "même le 1er palier
// le permet"). Same admin bypass and ACTIVE_STATUSES source of truth.
export async function hasActiveSubscription(accountId: string): Promise<boolean> {
  return (await getBusinessEntitlement(accountId)).active;
}

export async function getNativeBookingEntitlements(accountId: string): Promise<NativeBookingEntitlements> {
  const entitlement = await getBusinessEntitlement(accountId);
  if (!entitlement.active) return { enabled: false, maxEvents: 0 };
  if (entitlement.isExempt) return { enabled: true, maxEvents: null };
  const features = await getFeatures(accountId);
  return {
    enabled: features.nativeBookingEnabled === true,
    maxEvents: features.maxBookingEvents ?? null,
  };
}

export async function getNativeBookingUsage(accountId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(nativeBookingEvents)
    .where(and(eq(nativeBookingEvents.userId, accountId), ne(nativeBookingEvents.status, "archived")));
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
