// Split from failed-payments.ts (which pulls in @/db and is server-only) —
// this one is imported from sale-detail-drawer.tsx, a client component, so
// it must stay free of any server-only dependency.
export function stripeDashboardChargeUrl(stripeAccountId: string, chargeId: string, livemode: boolean): string {
  const base = `https://dashboard.stripe.com/${stripeAccountId}`;
  return livemode ? `${base}/payments/${chargeId}` : `${base}/test/payments/${chargeId}`;
}
