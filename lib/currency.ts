// "4 280 €" — space thousands separator, symbol after, no decimals. Takes a
// plain euro amount, NOT cents — business_profile.sales.offers[].price and
// every dashboard money value are stored/computed in plain euros (unlike the
// legacy `diagnostics.dollarsLost`, which is USD cents). Stripe amounts are
// cents and must be divided by 100 by the caller before reaching this.
export function formatEur(amount: number, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const USD_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// Minaly's own subscription pricing (what the infopreneur pays Minaly) is
// USD, matching the marketing pricing tiers — unlike formatEur above, which
// is the infopreneur's OWN business numbers (their US customers, but their
// dashboard is denominated in euros). Takes cents (subscriptionPlans.priceMonthlyCents).
export function formatUsdCents(cents: number): string {
  return USD_FORMAT.format(cents / 100);
}
