import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { sales } from "@/db/schema";
import {
  resolveMetaTouchpoint,
  resolveMetaTouchpointFromIdentifiers,
  resolveMetaTouchpointFromUtm,
} from "@/lib/meta-ads/attribution";
import { readMetaTracking } from "@/lib/meta-ads/tracking";

import type { ReadOnlyStripeClient } from "./read-only-client";
import {
  appendStripeSubscriptionCharge,
  applyStripeChargeToSale,
  buildStripeInstallment,
  matchStripeCharge,
  type ReconciliationSale,
  type StripeChargeForReconciliation,
} from "./reconcile-sales";

const DECLINE_REASON_LABELS: Record<string, string> = {
  card_declined: "Carte refusée",
  insufficient_funds: "Fonds insuffisants",
  expired_card: "Carte expirée",
  incorrect_cvc: "CVC incorrect",
  processing_error: "Erreur de traitement",
  fraudulent: "Paiement bloqué (suspicion de fraude)",
};

const chargeInvoiceShape = z.object({
  invoice: z.union([z.string(), z.object({ id: z.string().min(1) })]).nullable().optional(),
});

function declineReasonLabel(charge: Stripe.Charge): string {
  const code = charge.outcome?.reason ?? charge.failure_code ?? null;
  if (code && DECLINE_REASON_LABELS[code]) return DECLINE_REASON_LABELS[code];
  return charge.failure_message ?? "Paiement refusé";
}

function lookbackUnixSeconds(monthsBack: number): number {
  return Math.floor(Date.now() / 1000) - monthsBack * 31 * 24 * 60 * 60;
}

function resourceId(resource: string | { id: string } | null | undefined): string | null {
  return typeof resource === "string" ? resource : resource?.id ?? null;
}

function chargeEmail(charge: Stripe.Charge): string | null {
  return charge.billing_details.email?.trim() || charge.receipt_email?.trim() || null;
}

function chargeClientName(charge: Stripe.Charge): string | null {
  return charge.billing_details.name?.trim() || null;
}

async function hasSubscriptionInvoice(
  charge: Stripe.Charge,
  stripe: ReadOnlyStripeClient
): Promise<boolean> {
  const parsed = chargeInvoiceShape.safeParse(charge);
  if (!parsed.success || !parsed.data.invoice) return false;

  const invoiceId = typeof parsed.data.invoice === "string" ? parsed.data.invoice : parsed.data.invoice.id;
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    return Boolean(
      invoice.billing_reason?.startsWith("subscription") || invoice.parent?.type === "subscription_details"
    );
  } catch {
    // The charge is still useful even when an invoice cannot be retrieved. The
    // customer-based fallback below handles existing subscription deals.
    return false;
  }
}

async function hasActiveSubscriptionAtCharge(
  customerId: string,
  chargeCreatedAt: number,
  stripe: ReadOnlyStripeClient,
  cache: Map<string, boolean>
): Promise<boolean> {
  const cached = cache.get(customerId);
  if (cached !== undefined) return cached;

  let found = false;
  try {
    for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
      const startsBeforeCharge = subscription.created <= chargeCreatedAt;
      const endsAfterCharge = subscription.ended_at === null || subscription.ended_at >= chargeCreatedAt;
      if (startsBeforeCharge && endsAfterCharge) {
        found = true;
        break;
      }
    }
  } catch {
    // Subscription discovery is a classification aid, never a reason to
    // abort the whole account sync. An existing local subscription deal still
    // wins through the pure customer matcher.
  }

  cache.set(customerId, found);
  return found;
}

async function toReconciliationCharge(
  charge: Stripe.Charge,
  stripe: ReadOnlyStripeClient,
  refundedChargeIds: ReadonlySet<string>,
  subscriptionCustomerCache: Map<string, boolean>,
  metaTouchpointId: string | null,
): Promise<StripeChargeForReconciliation> {
  const customerId = resourceId(charge.customer);
  const invoiceSubscription = await hasSubscriptionInvoice(charge, stripe);
  const customerSubscription = customerId
    ? await hasActiveSubscriptionAtCharge(customerId, charge.created, stripe, subscriptionCustomerCache)
    : false;

  return {
    id: charge.id,
    status: charge.status === "failed" ? "failed" : "succeeded",
    amountEur: Math.round(charge.amount / 100),
    createdAt: new Date(charge.created * 1000).toISOString().slice(0, 10),
    email: chargeEmail(charge),
    clientName: chargeClientName(charge),
    customerId,
    isSubscription: invoiceSubscription || customerSubscription,
    isRefunded: charge.refunded || charge.amount_refunded > 0 || refundedChargeIds.has(charge.id),
    failureReason: charge.status === "failed" ? declineReasonLabel(charge) : null,
    metaTouchpointId,
  };
}

function toReconciliationSale(row: typeof sales.$inferSelect): ReconciliationSale {
  return {
    id: row.id,
    clientEmail: row.clientEmail,
    totalPrice: row.totalPrice,
    paymentType: row.paymentType,
    paymentMethod: row.paymentMethod,
    installments: row.installments,
    stripeCustomerId: row.stripeCustomerId,
    metaTouchpointId: row.metaTouchpointId,
    isOrphan: row.isOrphan,
  };
}

async function updateInstallments(accountId: string, sale: ReconciliationSale): Promise<void> {
  await db
    .update(sales)
    .set({ installments: sale.installments, metaTouchpointId: sale.metaTouchpointId })
    .where(and(eq(sales.id, sale.id), eq(sales.userId, accountId)));
}

function hasMetaTrackingSignal(tracking: ReturnType<typeof readMetaTracking>): boolean {
  return Boolean(
    tracking.metaTouchpointToken ||
      tracking.metaCampaignExternalId ||
      tracking.metaAdSetExternalId ||
      tracking.metaAdExternalId ||
      tracking.utmCampaign ||
      tracking.utmContent,
  );
}

async function paymentIntentMetadata(
  stripe: ReadOnlyStripeClient,
  charge: Stripe.Charge,
  cache: Map<string, Record<string, string> | null>,
): Promise<Record<string, string> | null> {
  const paymentIntentId = resourceId(charge.payment_intent);
  if (!paymentIntentId) return null;
  if (cache.has(paymentIntentId)) return cache.get(paymentIntentId) ?? null;

  if (typeof charge.payment_intent === "object" && charge.payment_intent !== null) {
    const metadata = charge.payment_intent.metadata ?? null;
    cache.set(paymentIntentId, metadata);
    return metadata;
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = paymentIntent.metadata ?? null;
    cache.set(paymentIntentId, metadata);
    return metadata;
  } catch {
    // Attribution is additive. A PaymentIntent that cannot be read must not
    // prevent the rest of the Stripe reconciliation from completing.
    cache.set(paymentIntentId, null);
    return null;
  }
}

async function resolveStripeChargeTouchpoint(
  accountId: string,
  charge: Stripe.Charge,
  stripe: ReadOnlyStripeClient,
  paymentIntentMetadataCache: Map<string, Record<string, string> | null>,
): Promise<string | null> {
  const chargeTracking = readMetaTracking(charge.metadata);
  const intentMetadata = hasMetaTrackingSignal(chargeTracking)
    ? null
    : await paymentIntentMetadata(stripe, charge, paymentIntentMetadataCache);
  const tracking = readMetaTracking(charge.metadata, intentMetadata);
  const touchpoint = (tracking.metaTouchpointToken
    ? await resolveMetaTouchpoint(accountId, tracking.metaTouchpointToken)
    : null) ?? (await resolveMetaTouchpointFromIdentifiers({
      userId: accountId,
      campaignExternalId: tracking.metaCampaignExternalId,
      adSetExternalId: tracking.metaAdSetExternalId,
      adExternalId: tracking.metaAdExternalId,
    })) ?? (await resolveMetaTouchpointFromUtm({
      userId: accountId,
      utmCampaign: tracking.utmCampaign,
      utmContent: tracking.utmContent,
    }));
  return touchpoint?.touchpointId ?? null;
}

function replaceLocalSale(salesRows: ReconciliationSale[], updated: ReconciliationSale): void {
  const index = salesRows.findIndex((sale) => sale.id === updated.id);
  if (index >= 0) salesRows[index] = updated;
}

function newStripeSaleValues(charge: StripeChargeForReconciliation): Omit<typeof sales.$inferInsert, "userId"> {
  return {
    clientName: charge.clientName ?? "À identifier",
    clientEmail: charge.email,
    sourceChannel: "Stripe",
    totalPrice: charge.amountEur,
    paymentType: charge.isSubscription ? "subscription" : "one_shot",
    paymentMethod: "stripe",
    source: "stripe",
    isOrphan: true,
    stripeCustomerId: charge.isSubscription ? charge.customerId : null,
    installments: [buildStripeInstallment(charge)],
    saleDate: charge.createdAt,
    hasUpsell: false,
    metaTouchpointId: charge.metaTouchpointId ?? null,
  };
}

export type StripeSalesSyncResult = {
  matched: number;
  created: number;
  orphaned: number;
  refunded: number;
  skipped: number;
  ambiguous: number;
};

/**
 * Reconcile succeeded/failed Connect charges into the account's deal rows.
 * Every database query is scoped to accountId and the only Stripe client this
 * function accepts is the read-only Connect client.
 */
export async function syncStripeSales(
  accountId: string,
  stripe: ReadOnlyStripeClient,
  monthsBack = 12
): Promise<StripeSalesSyncResult> {
  const since = lookbackUnixSeconds(monthsBack);
  const charges: Stripe.Charge[] = [];
  for await (const charge of stripe.charges.list({ created: { gte: since }, expand: ["data.payment_intent"], limit: 100 })) {
    if (charge.status === "succeeded" || charge.status === "failed") charges.push(charge);
  }

  const refundedChargeIds = new Set<string>();
  for await (const refund of stripe.refunds.list({ created: { gte: since }, limit: 100 })) {
    const chargeId = resourceId(refund.charge);
    if (chargeId) refundedChargeIds.add(chargeId);
  }

  const existingRows = await db.select().from(sales).where(eq(sales.userId, accountId));
  const localSales = existingRows.map(toReconciliationSale);
  const subscriptionCustomerCache = new Map<string, boolean>();
  const paymentIntentMetadataCache = new Map<string, Record<string, string> | null>();
  const result: StripeSalesSyncResult = { matched: 0, created: 0, orphaned: 0, refunded: 0, skipped: 0, ambiguous: 0 };

  for (const stripeCharge of charges) {
    const metaTouchpointId = await resolveStripeChargeTouchpoint(accountId, stripeCharge, stripe, paymentIntentMetadataCache);
    const charge = await toReconciliationCharge(stripeCharge, stripe, refundedChargeIds, subscriptionCustomerCache, metaTouchpointId);
    const match = matchStripeCharge(charge, localSales);

    if (match.kind === "already_recorded") {
      const sale = localSales.find((candidate) => candidate.id === match.saleId);
      const current = sale?.installments?.[match.installmentIndex];
      if (sale && current && (charge.isRefunded && current.status !== "refunded" || sale.metaTouchpointId === null && charge.metaTouchpointId !== null)) {
        const updated = applyStripeChargeToSale(sale, charge, match.installmentIndex);
        await updateInstallments(accountId, updated);
        replaceLocalSale(localSales, updated);
        if (charge.isRefunded && current.status !== "refunded") result.refunded += 1;
      } else {
        result.skipped += 1;
      }
      continue;
    }

    if (match.kind === "matched") {
      const sale = localSales.find((candidate) => candidate.id === match.saleId);
      if (!sale) continue;
      const updated = applyStripeChargeToSale(sale, charge, match.installmentIndex);
      await updateInstallments(accountId, updated);
      replaceLocalSale(localSales, updated);
      result.matched += 1;
      if (charge.isRefunded) result.refunded += 1;
      continue;
    }

    if (match.kind === "subscription") {
      const sale = localSales.find((candidate) => candidate.id === match.saleId);
      if (!sale) continue;
      const updated = appendStripeSubscriptionCharge(sale, charge);
      await updateInstallments(accountId, updated);
      replaceLocalSale(localSales, updated);
      result.matched += 1;
      if (charge.isRefunded) result.refunded += 1;
      continue;
    }

    if (match.kind === "ambiguous") {
      result.ambiguous += 1;
      if (charge.status !== "succeeded") {
        result.skipped += 1;
        continue;
      }
    }

    if (match.kind === "skip_failed") {
      result.skipped += 1;
      continue;
    }

    // Failed charges retain the old best-effort behavior: they only update a
    // clearly matched installment; they never create a phantom sale row.
    if (charge.status !== "succeeded") {
      result.skipped += 1;
      continue;
    }

    const [createdRow] = await db
      .insert(sales)
      .values({ ...newStripeSaleValues(charge), userId: accountId })
      .returning();
    localSales.push(toReconciliationSale(createdRow));
    result.created += 1;
    result.orphaned += 1;
    if (charge.isRefunded) result.refunded += 1;
  }

  return result;
}

// Kept as a compatibility wrapper for callers that only need the legacy
// failed-payment count. The sync itself now covers succeeded charges and
// refunds too; new code should call syncStripeSales directly.
export async function syncFailedStripeCharges(
  accountId: string,
  stripe: ReadOnlyStripeClient,
  monthsBack = 12
): Promise<{ matched: number }> {
  const result = await syncStripeSales(accountId, stripe, monthsBack);
  return { matched: result.matched };
}
