import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { subscriptionPlans, subscriptions } from "@/db/schema";

export const subscriptionMetadataSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  stripePriceId: z.string().min(1).optional(),
  priceMonthlyCents: z
    .string()
    .regex(/^\d+$/)
    .refine((value) => Number.isSafeInteger(Number(value)), "Montant Stripe invalide")
    .optional(),
  referralAttributionId: z.string().uuid().optional(),
});

const stripePriceSchema = z
  .object({
    id: z.string().min(1),
    unit_amount: z.number().int().nonnegative().nullable().optional(),
    recurring: z
      .object({ interval: z.string().min(1) })
      .nullable()
      .optional(),
  })
  .passthrough();

const stripeSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    customer: z.union([z.string().min(1), z.object({ id: z.string().min(1) }).passthrough()]),
    status: z.string().min(1),
    cancel_at_period_end: z.boolean(),
    current_period_end: z.number().int().positive().nullable().optional(),
    metadata: z.record(z.string(), z.string()),
    items: z
      .object({
        data: z
          .array(
            z
              .object({
                current_period_end: z.number().int().positive().nullable().optional(),
                price: z.union([stripePriceSchema, z.string().min(1)]),
              })
              .passthrough()
          )
          .min(1),
      })
      .passthrough(),
  })
  .passthrough();

export type ParsedStripeSubscription = {
  userId: string;
  metadataPlanId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string | null;
  priceMonthlyCents: number | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type SubscriptionProjectionSyncResult =
  | { ok: true; projection: ParsedStripeSubscription; planId: string }
  | { ok: false; code: "invalid" | "mismatch" | "conflict" | "plan_missing"; error: string };

function epochToDate(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

export function parseStripeSubscription(value: unknown): ParsedStripeSubscription | null {
  const parsed = stripeSubscriptionSchema.safeParse(value);
  if (!parsed.success) return null;

  const metadata = subscriptionMetadataSchema.safeParse(parsed.data.metadata);
  if (!metadata.success) return null;

  const recurringItem = parsed.data.items.data.find((item) => {
    if (typeof item.price === "string") return true;
    return item.price.recurring !== null && item.price.recurring !== undefined;
  });
  const item = recurringItem;
  if (!item) return null;

  const price = item.price;
  const stripePriceId = typeof price === "string" ? price : price.id;
  const priceMonthlyCents =
    typeof price === "string"
      ? metadata.data.priceMonthlyCents
        ? Number(metadata.data.priceMonthlyCents)
        : null
      : price.recurring?.interval === "month" && typeof price.unit_amount === "number"
        ? price.unit_amount
        : null;
  const currentPeriodEndSeconds = parsed.data.current_period_end ?? item.current_period_end ?? null;

  return {
    userId: metadata.data.userId,
    metadataPlanId: metadata.data.planId,
    stripeSubscriptionId: parsed.data.id,
    stripeCustomerId: typeof parsed.data.customer === "string" ? parsed.data.customer : parsed.data.customer.id,
    stripePriceId: stripePriceId ?? metadata.data.stripePriceId ?? null,
    priceMonthlyCents,
    status: parsed.data.status,
    currentPeriodEnd: epochToDate(currentPeriodEndSeconds),
    cancelAtPeriodEnd: parsed.data.cancel_at_period_end,
  };
}

export async function syncStripeSubscriptionProjection(
  value: unknown,
  expectedUserId?: string
): Promise<SubscriptionProjectionSyncResult> {
  const projection = parseStripeSubscription(value);
  if (!projection) {
    return {
      ok: false,
      code: "invalid",
      error: "Les données Stripe de cet abonnement sont invalides ou incomplètes.",
    };
  }

  if (expectedUserId && projection.userId !== expectedUserId) {
    return { ok: false, code: "mismatch", error: "Cet abonnement Stripe ne correspond pas au compte demandé." };
  }

  const [existingBySubscription] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, projection.stripeSubscriptionId))
    .limit(1);
  if (existingBySubscription && existingBySubscription.userId !== projection.userId) {
    return { ok: false, code: "conflict", error: "Cet abonnement Stripe est déjà rattaché à un autre compte." };
  }

  const [planByPrice] = projection.stripePriceId
    ? await db
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.stripePriceId, projection.stripePriceId))
        .limit(1)
    : [];
  if (planByPrice && planByPrice.id !== projection.metadataPlanId) {
    return {
      ok: false,
      code: "conflict",
      error: "Le Price Stripe ne correspond pas au plan déclaré par cet abonnement.",
    };
  }
  const planId = planByPrice?.id ?? projection.metadataPlanId;

  const [plan] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);
  if (!plan) {
    return { ok: false, code: "plan_missing", error: "Le plan associé à cet abonnement est introuvable." };
  }

  const values = {
    userId: projection.userId,
    planId: plan.id,
    stripeCustomerId: projection.stripeCustomerId,
    stripeSubscriptionId: projection.stripeSubscriptionId,
    stripePriceId: projection.stripePriceId,
    priceMonthlyCents: projection.priceMonthlyCents,
    status: projection.status,
    currentPeriodEnd: projection.currentPeriodEnd,
    cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { ...values, updatedAt: new Date() },
    });

  return { ok: true, projection, planId: plan.id };
}
