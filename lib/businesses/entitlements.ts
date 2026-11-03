import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { businesses, subscriptionPlans, subscriptions, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { z } from "zod";

export type BusinessEntitlement = {
  active: boolean;
  isExempt: boolean;
  reason: "payment_required" | "payment_failed" | "expired" | "archived" | "team_unavailable" | null;
};

export function evaluateBusinessEntitlement(input: {
  status: string;
  billingExempt: boolean;
  ownerIsAdmin: boolean;
  subscriptionStatus?: string | null;
  paymentBlockedAt?: Date | null;
  currentPeriodEnd?: Date | null;
}, now = new Date()): BusinessEntitlement {
  if (input.status === "archived") return { active: false, isExempt: false, reason: "archived" };
  if (input.billingExempt && input.ownerIsAdmin) return { active: true, isExempt: true, reason: null };
  if (input.paymentBlockedAt || ["past_due", "unpaid", "paused"].includes(input.subscriptionStatus ?? "")) {
    return { active: false, isExempt: false, reason: "payment_failed" };
  }
  if (input.currentPeriodEnd && input.currentPeriodEnd <= now) return { active: false, isExempt: false, reason: "expired" };
  if (!["active", "trialing"].includes(input.subscriptionStatus ?? "")) {
    return { active: false, isExempt: false, reason: input.subscriptionStatus ? "expired" : "payment_required" };
  }
  return { active: true, isExempt: false, reason: null };
}

export const getBusinessEntitlement = cache(async (businessId: string): Promise<BusinessEntitlement> => {
  const [row] = await db.select({
    status: businesses.status, billingExempt: businesses.billingExempt, ownerEmail: users.email,
    subscriptionStatus: subscriptions.status, paymentBlockedAt: subscriptions.paymentBlockedAt,
    currentPeriodEnd: subscriptions.currentPeriodEnd,
  }).from(businesses).innerJoin(users, eq(users.id, businesses.ownerUserId))
    .leftJoin(subscriptions, eq(subscriptions.userId, businesses.id)).where(eq(businesses.id, businessId)).limit(1);
  return row ? evaluateBusinessEntitlement({ ...row, ownerIsAdmin: isAdminEmail(row.ownerEmail) })
    : { active: false, isExempt: false, reason: "archived" };
});

export const getBusinessMemberEntitlement = cache(async (businessId: string): Promise<BusinessEntitlement> => {
  const entitlement = await getBusinessEntitlement(businessId);
  if (!entitlement.active || entitlement.isExempt) return entitlement;
  const [row] = await db.select({ features: subscriptionPlans.features }).from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId)).where(eq(subscriptions.userId, businessId)).limit(1);
  const features = z.object({ teamMembersEnabled: z.boolean().optional() }).safeParse(row?.features);
  return features.success && features.data.teamMembersEnabled === true ? entitlement
    : { active: false, isExempt: false, reason: "team_unavailable" };
});
