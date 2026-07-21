"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";

import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { planInputSchema, type PlanInput } from "@/lib/billing/plan-schema";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";

// Stripe Prices are immutable once created — there's no "edit the amount"
// API. Changing a plan's price here creates a NEW Price on the same
// Product, archives (deactivates, never deletes) the old one, and returns
// the new Price id to store as subscriptionPlans.stripePriceId. A plan
// saved for the first time creates both the Product and its first Price.
async function syncStripePrice(
  stripe: Stripe,
  input: PlanInput,
  existingStripePriceId: string | null
): Promise<string> {
  let productId: string;

  if (existingStripePriceId) {
    const existingPrice = await stripe.prices.retrieve(existingStripePriceId);
    productId = typeof existingPrice.product === "string" ? existingPrice.product : existingPrice.product.id;
    await stripe.products.update(productId, { name: input.name });
    if (existingPrice.unit_amount === input.priceMonthlyCents) {
      return existingStripePriceId;
    }
    await stripe.prices.update(existingStripePriceId, { active: false });
  } else {
    const product = await stripe.products.create({ name: input.name });
    productId = product.id;
  }

  const newPrice = await stripe.prices.create({
    product: productId,
    unit_amount: input.priceMonthlyCents,
    currency: "usd",
    recurring: { interval: "month" },
  });
  return newPrice.id;
}

export async function savePlan(id: string | null, data: unknown): Promise<{ error: string | null }> {
  await requireAdmin();

  const parsed = planInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const input = parsed.data;
  const features = { teamMembersEnabled: input.teamMembersEnabled, maxTeamMembers: input.maxTeamMembers };
  const stripe = getPlatformStripeClient();

  if (id) {
    const [existing] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    if (!existing) return { error: "Plan introuvable" };

    const stripePriceId = await syncStripePrice(stripe, input, existing.stripePriceId);

    await db
      .update(subscriptionPlans)
      .set({
        key: input.key,
        name: input.name,
        priceMonthlyCents: input.priceMonthlyCents,
        stripePriceId,
        features,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlans.id, id));
  } else {
    const stripePriceId = await syncStripePrice(stripe, input, null);
    await db.insert(subscriptionPlans).values({
      key: input.key,
      name: input.name,
      priceMonthlyCents: input.priceMonthlyCents,
      stripePriceId,
      features,
      isActive: input.isActive,
    });
  }

  revalidatePath("/admin/plans");
  return { error: null };
}

export async function setPlanActive(id: string, isActive: boolean): Promise<{ error: string | null }> {
  await requireAdmin();
  await db.update(subscriptionPlans).set({ isActive, updatedAt: new Date() }).where(eq(subscriptionPlans.id, id));
  revalidatePath("/admin/plans");
  return { error: null };
}
