"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@/db";
import { businesses, subscriptions } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { syncStripeSubscriptionProjection } from "@/lib/billing/stripe-subscription";
import { resumeBusinessOperations } from "@/lib/inngest/business-recovery";
import { isRateLimited } from "@/lib/rate-limit";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { getAppUrl } from "@/lib/utils";

const accountIdSchema = z.string().uuid();
export type AdminBillingActionResult = { error: string | null; message?: string; url?: string };

export async function createAdminBillingPortalLink(accountId: unknown): Promise<AdminBillingActionResult> {
  await requireAdmin();
  const t = await getTranslations("billing");
  const parsed = accountIdSchema.safeParse(accountId);
  if (!parsed.success) return { error: t("errors.accountInvalid") };
  if (isRateLimited(`admin-billing-portal:${parsed.data}`, 8)) return { error: t("errors.rateLimited") };
  const [business] = await db.select({ stripeCustomerId: businesses.stripeCustomerId }).from(businesses)
    .where(and(eq(businesses.id, parsed.data), ne(businesses.status, "archived"))).limit(1);
  if (!business?.stripeCustomerId) return { error: t("errors.customerMissing") };
  try {
    const session = z.object({ url: z.string().url() }).parse(await getPlatformStripeClient().billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: new URL(`/admin/subscriptions/${parsed.data}`, getAppUrl()).toString(),
    }));
    return { error: null, message: t("portalCreated"), url: session.url };
  } catch {
    return { error: t("errors.unavailable") };
  }
}

export async function resyncAdminSubscription(accountId: unknown): Promise<AdminBillingActionResult> {
  await requireAdmin();
  const t = await getTranslations("billing");
  const parsed = accountIdSchema.safeParse(accountId);
  if (!parsed.success) return { error: t("errors.accountInvalid") };
  if (isRateLimited(`admin-billing-resync:${parsed.data}`, 8)) return { error: t("errors.rateLimited") };
  const [row] = await db.select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId }).from(subscriptions)
    .innerJoin(businesses, eq(businesses.id, subscriptions.userId))
    .where(and(eq(subscriptions.userId, parsed.data), ne(businesses.status, "archived"))).limit(1);
  if (!row?.stripeSubscriptionId) return { error: t("errors.subscriptionMissing") };
  try {
    const id = row.stripeSubscriptionId;
    const retrieve = () => getPlatformStripeClient().subscriptions.retrieve(id, { expand: ["items.data.price", "latest_invoice"] });
    const result = await syncStripeSubscriptionProjection(await retrieve(), parsed.data, { refresh: retrieve });
    if (!result.ok) return { error: t(`errors.${result.code}`) };
    if (result.applied && ["active", "trialing"].includes(result.projection.status)) {
      await resumeBusinessOperations(parsed.data);
    }
    revalidatePath("/admin/subscriptions");
    revalidatePath(`/admin/subscriptions/${parsed.data}`);
    revalidatePath("/settings/facturation");
    return { error: null, message: t("subscriptionSynced") };
  } catch {
    return { error: t("errors.unavailable") };
  }
}
