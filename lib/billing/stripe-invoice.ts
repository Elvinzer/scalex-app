import { z } from "zod";

const stripeReferenceSchema = z.union([z.string().min(1), z.object({ id: z.string().min(1) })]);

export const billingInvoiceSchema = z.object({
  id: z.string().min(1),
  subscription: stripeReferenceSchema.nullable().optional(),
  parent: z.object({
    subscription_details: z.object({ subscription: stripeReferenceSchema }).nullable().optional(),
  }).nullable().optional(),
  currency: z.string().regex(/^[a-zA-Z]{3}$/).optional(),
  amount_paid: z.number().int().nonnegative().optional(),
  total_excluding_tax: z.number().int().nonnegative().nullable().optional(),
  period_start: z.number().int().nullable().optional(),
  period_end: z.number().int().nullable().optional(),
});

export function getInvoiceSubscriptionId(value: unknown): string | null {
  const parsed = billingInvoiceSchema.safeParse(value);
  if (!parsed.success) return null;
  const reference = parsed.data.parent?.subscription_details?.subscription ?? parsed.data.subscription;
  return typeof reference === "string" ? reference : reference?.id ?? null;
}
