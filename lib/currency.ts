const EUR_FORMAT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// "4 280 €" — space thousands separator, symbol after, no decimals. Takes a
// plain euro amount, NOT cents — business_profile.sales.offers[].price and
// every dashboard money value are stored/computed in plain euros (unlike the
// legacy `diagnostics.dollarsLost`, which is USD cents). Stripe amounts are
// cents and must be divided by 100 by the caller before reaching this.
export function formatEur(amount: number): string {
  return EUR_FORMAT.format(amount);
}
