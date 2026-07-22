import Stripe from "stripe";

type ReadOnlyResource<T> = Pick<T, Extract<keyof T, "list" | "retrieve">>;

export type ReadOnlyStripeClient = {
  charges: ReadOnlyResource<Stripe["charges"]>;
  invoices: ReadOnlyResource<Stripe["invoices"]>;
  refunds: ReadOnlyResource<Stripe["refunds"]>;
  subscriptions: ReadOnlyResource<Stripe["subscriptions"]>;
  customers: ReadOnlyResource<Stripe["customers"]>;
  balanceTransactions: ReadOnlyResource<Stripe["balanceTransactions"]>;
};

// Stripe Standard accounts require the OAuth "read_write" scope (`read_only`
// is Extension-only, a different Stripe partner category) — so the
// write-prevention for a connected account's token lives here instead: this
// is the only sanctioned way to get a client scoped to a connected account,
// and its type only exposes `list`/`retrieve`. Calling a write method on the
// result is a compile error, not just a convention.
export function createReadOnlyStripeClient(accessToken: string): ReadOnlyStripeClient {
  const stripe = new Stripe(accessToken);
  return {
    charges: stripe.charges,
    invoices: stripe.invoices,
    refunds: stripe.refunds,
    subscriptions: stripe.subscriptions,
    customers: stripe.customers,
    balanceTransactions: stripe.balanceTransactions,
  };
}
