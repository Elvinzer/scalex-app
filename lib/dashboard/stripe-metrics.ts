import { eq } from "drizzle-orm";

import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import type { DateRange } from "@/lib/date-range";
import { createReadOnlyStripeClient } from "@/lib/stripe/read-only-client";

export type StripeActivity = {
  charges: { createdAt: Date; amountCents: number }[];
  customers: { createdAt: Date }[];
};

function toUnixRange(range: DateRange): { gte: number; lte: number } {
  return {
    gte: Math.floor(new Date(`${range.from}T00:00:00Z`).getTime() / 1000),
    // End of day so `to` is inclusive.
    lte: Math.floor(new Date(`${range.to}T23:59:59Z`).getTime() / 1000),
  };
}

// Raw records (not pre-aggregated) over `range` — the caller buckets/sums
// these in code (lib/dashboard/metrics.ts), so one fetch here covers both
// the current/previous-30-days comparison and the 8-week sparkline. Queried
// live on each Dashboard load (no sync job/table yet) — acceptable at
// current scale; a cached periodic sync is a Phase 2 optimization if load
// becomes an issue. Returns null when Stripe isn't connected, so the caller
// can render the "Donnée manquante — Connecte Stripe" card state.
export async function getStripeActivity(userId: string, range: DateRange): Promise<StripeActivity | null> {
  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, userId))
    .limit(1);

  if (!connection) return null;

  const stripe = createReadOnlyStripeClient(decrypt(connection.accessTokenEncrypted));
  const created = toUnixRange(range);

  const charges: StripeActivity["charges"] = [];
  for await (const charge of stripe.charges.list({ created, limit: 100 })) {
    if (charge.status === "succeeded") {
      charges.push({ createdAt: new Date(charge.created * 1000), amountCents: charge.amount });
    }
  }

  const customers: StripeActivity["customers"] = [];
  for await (const customer of stripe.customers.list({ created, limit: 100 })) {
    customers.push({ createdAt: new Date(customer.created * 1000) });
  }

  return { charges, customers };
}
