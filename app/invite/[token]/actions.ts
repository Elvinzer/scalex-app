"use server";

import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@/db";
import { businesses, subscriptionPlans, subscriptions, teamMembers } from "@/db/schema";
import { track } from "@/lib/analytics";
import { getAuthIdentity } from "@/lib/auth/request";
import { hasActiveTeamSubscription } from "@/lib/billing/plan-gate";
import { parsePlanFeatures } from "@/lib/billing/plan-schema";
import { businessHref } from "@/lib/businesses/routing";
import { ensureUserRow } from "@/lib/current-user";
import { isRateLimited } from "@/lib/rate-limit";
import { getDefaultAppRoute, getAccountContext } from "@/lib/team/context";
import { getInviteByToken } from "@/lib/team/queries";

export async function acceptInvite(token: string): Promise<{ error: string | null; redirectTo?: string }> {
  const t = await getTranslations("billing.invite");
  const identity = await getAuthIdentity();
  if (!identity?.email) return { error: t("signInRequired") };
  if (isRateLimited(`invite-accept:${identity.userId}`, 20)) return { error: t("unavailable") };
  const parsed = z.string().trim().min(16).max(256).safeParse(token);
  if (!parsed.success) return { error: t("invalidHelp") };
  const invite = await getInviteByToken(parsed.data);
  if (!invite) return { error: t("invalidHelp") };
  if (invite.email.toLowerCase() !== identity.email.toLowerCase()) return { error: t("wrongEmail", { email: invite.email }) };
  await ensureUserRow(identity.userId, identity.email, { captureReferral: false });

  const error = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing:${invite.accountId}`}, 0))`);
    const [current] = await tx.select().from(teamMembers).where(and(
      eq(teamMembers.id, invite.id), eq(teamMembers.inviteToken, parsed.data),
      eq(teamMembers.status, "invited"), gt(teamMembers.inviteExpiresAt, new Date()),
    )).limit(1);
    if (!current || current.email.toLowerCase() !== identity.email?.toLowerCase()) return t("invalidHelp");
    const [business] = await tx.select({ ownerUserId: businesses.ownerUserId }).from(businesses)
      .where(eq(businesses.id, invite.accountId)).limit(1);
    if (!business || !(await hasActiveTeamSubscription(invite.accountId))) return t("unavailable");
    if (business.ownerUserId === identity.userId) return t("alreadyOwner");
    const [plan] = await tx.select({ features: subscriptionPlans.features }).from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
      .where(eq(subscriptions.userId, invite.accountId)).limit(1);
    const max = parsePlanFeatures(plan?.features).maxTeamMembers;
    if (max != null) {
      const [active] = await tx.select({ value: count() }).from(teamMembers).where(and(
        eq(teamMembers.accountId, invite.accountId), eq(teamMembers.status, "active"), ne(teamMembers.id, invite.id),
      ));
      if (Number(active?.value ?? 0) >= max) return t("limitReached");
    }
    const [accepted] = await tx.update(teamMembers).set({
      memberUserId: identity.userId, status: "active", joinedAt: new Date(), inviteToken: null, inviteExpiresAt: null,
    }).where(and(eq(teamMembers.id, invite.id), eq(teamMembers.status, "invited"), eq(teamMembers.inviteToken, parsed.data)))
      .returning({ id: teamMembers.id });
    return accepted ? null : t("invalidHelp");
  });
  if (error) return { error };
  await track("team_invite_accepted", identity.userId, { business_id: invite.accountId });
  const context = await getAccountContext(identity.userId, { businessId: invite.accountId });
  return { error: null, redirectTo: businessHref(invite.accountId, getDefaultAppRoute(context)) };
}
