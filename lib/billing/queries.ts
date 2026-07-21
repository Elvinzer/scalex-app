import { eq } from "drizzle-orm";

import { db } from "@/db";
import { subscriptionPlans, subscriptions } from "@/db/schema";

export async function getActivePlans() {
  return db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, true))
    .orderBy(subscriptionPlans.priceMonthlyCents);
}

export async function getAccountSubscription(accountId: string) {
  const [row] = await db
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      plan: subscriptionPlans,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(subscriptions.userId, accountId))
    .limit(1);

  return row ?? null;
}
