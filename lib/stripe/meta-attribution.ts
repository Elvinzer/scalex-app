import { readMetaTracking, type MetaTrackingFields } from "@/lib/meta-ads/tracking";

export function hasStripeMetaAttributionSignal(tracking: MetaTrackingFields): boolean {
  return Boolean(
    tracking.metaTouchpointToken ||
      tracking.metaCampaignExternalId ||
      tracking.metaAdSetExternalId ||
      tracking.metaAdExternalId ||
      tracking.utmCampaign ||
      tracking.utmContent,
  );
}

/**
 * Reads attribution already present on a Stripe charge or its PaymentIntent.
 *
 * The connected Stripe account remains read-only: this helper never creates,
 * updates, or backfills metadata. Charge fields take precedence when they
 * carry a usable signal; otherwise the PaymentIntent is used as a fallback.
 */
export function readStripeMetaTracking(
  chargeMetadata: unknown,
  paymentIntentMetadata: unknown,
): MetaTrackingFields {
  const chargeTracking = readMetaTracking(chargeMetadata);
  return hasStripeMetaAttributionSignal(chargeTracking)
    ? chargeTracking
    : readMetaTracking(chargeMetadata, paymentIntentMetadata);
}
