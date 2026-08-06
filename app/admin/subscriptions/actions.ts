"use server";

import { and, eq, ne, notExists } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { subscriptions, teamMembers, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { syncStripeSubscriptionProjection } from "@/lib/billing/stripe-subscription";
import { isRateLimited } from "@/lib/rate-limit";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { getAppUrl } from "@/lib/utils";

const accountIdSchema = z.string().uuid();

export type AdminBillingActionResult = {
  error: string | null;
  message?: string;
  url?: string;
};

export async function createAdminBillingPortalLink(accountId: unknown): Promise<AdminBillingActionResult> {
  await requireAdmin();

  const parsedAccountId = accountIdSchema.safeParse(accountId);
  if (!parsedAccountId.success) return { error: "Compte invalide." };

  const [row] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(
      and(
        eq(users.id, parsedAccountId.data),
        notExists(
          db
            .select({ id: teamMembers.id })
            .from(teamMembers)
            .where(and(eq(teamMembers.memberUserId, users.id), ne(teamMembers.status, "removed")))
        )
      )
    )
    .limit(1);

  if (!row?.stripeCustomerId) {
    return { error: "Ce compte n’a pas encore de client Stripe exploitable." };
  }

  try {
    const portalSession = await getPlatformStripeClient().billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: new URL("/settings/facturation", getAppUrl()).toString(),
    });

    return {
      error: null,
      message: "Lien généré. Il est temporaire et doit être ouvert maintenant.",
      url: portalSession.url,
    };
  } catch {
    return { error: "Impossible de générer le Billing Portal pour ce client Stripe." };
  }
}

export async function resyncAdminSubscription(accountId: unknown): Promise<AdminBillingActionResult> {
  await requireAdmin();

  const parsedAccountId = accountIdSchema.safeParse(accountId);
  if (!parsedAccountId.success) return { error: "Compte invalide." };

  if (isRateLimited(`admin-billing-resync:${parsedAccountId.data}`, 8)) {
    return { error: "Trop de tentatives rapprochées. Réessaie dans une minute." };
  }

  const [row] = await db
    .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, parsedAccountId.data),
        notExists(
          db
            .select({ id: teamMembers.id })
            .from(teamMembers)
            .where(and(eq(teamMembers.memberUserId, subscriptions.userId), ne(teamMembers.status, "removed")))
        )
      )
    )
    .limit(1);

  if (!row?.stripeSubscriptionId) {
    return { error: "Aucun abonnement Stripe synchronisable pour ce compte." };
  }

  try {
    const stripeSubscription = await getPlatformStripeClient().subscriptions.retrieve(row.stripeSubscriptionId, {
      expand: ["items.data.price"],
    });
    const result = await syncStripeSubscriptionProjection(stripeSubscription, parsedAccountId.data);
    if (!result.ok) return { error: result.error };

    revalidatePath("/admin/subscriptions");
    revalidatePath(`/admin/subscriptions/${parsedAccountId.data}`);
    revalidatePath("/settings/facturation");
    return { error: null, message: "Projection Stripe resynchronisée." };
  } catch {
    return { error: "Stripe n’a pas pu être interrogé. La projection locale a été conservée." };
  }
}
