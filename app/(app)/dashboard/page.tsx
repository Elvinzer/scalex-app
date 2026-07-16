import { and, eq } from "drizzle-orm";

import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { diagnostics } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

import { PendingRefresh } from "./pending-refresh";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data!.claims.sub as string;

  const [failedPayments] = await db
    .select()
    .from(diagnostics)
    .where(
      and(eq(diagnostics.userId, userId), eq(diagnostics.category, "failed_payments"))
    )
    .limit(1);

  if (!failedPayments) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Calculating your bottleneck...
        </p>
        <PendingRefresh />
      </div>
    );
  }

  const amount = (failedPayments.dollarsLost / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 text-center">
      <p className="text-lg text-muted-foreground">You lost</p>

      <div className="signature-glow relative flex w-full items-center justify-center rounded-4xl border border-border py-16">
        <p className="font-mono text-7xl font-semibold tabular-nums text-state-critical sm:text-8xl md:text-9xl">
          {amount}
        </p>
      </div>

      <p className="text-lg text-muted-foreground">
        in failed payments never followed up.
      </p>
      <Button size="lg" asChild className="mt-4">
        <a href="/diagnostic">See what else is costing you →</a>
      </Button>
    </div>
  );
}
