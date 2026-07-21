import { eq } from "drizzle-orm";

import { db } from "@/db";
import { subscriptionPlans, subscriptions } from "@/db/schema";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

// Single point of truth for "can this account use team members" — read both
// at invite time and on every request a team member makes (lib/team/context.ts),
// so a lapsed subscription cuts access immediately, not just future invites.
// Same "single point of config, easy to re-tune per tier later" philosophy
// as the shared-key quota, see lib/agent/quota.ts.
export async function hasActiveTeamSubscription(accountId: string): Promise<boolean> {
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
