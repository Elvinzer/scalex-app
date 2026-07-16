import { desc, eq } from "drizzle-orm";

import { DiagnosticPendingState, StripeOptionalState } from "@/components/diagnostic-empty-state";
import { db } from "@/db";
import { diagnostics } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { categoryLabel, formatUsd } from "@/lib/diagnostics";
import { cn } from "@/lib/utils";

export default async function ClosingPage() {
  const { userId, user } = await getCurrentUser();

  const rows = await db
    .select()
    .from(diagnostics)
    .where(eq(diagnostics.userId, userId))
    .orderBy(desc(diagnostics.dollarsLost));

  if (rows.length === 0) {
    if (!user?.stripeConnectId) {
      return (
        <StripeOptionalState
          title="Rien à prioriser pour l'instant"
          description="Connecte Stripe pour voir tes zones de perte classées par impact."
        />
      );
    }
    return <DiagnosticPendingState />;
  }

  const totalLost = rows.reduce((sum, row) => sum + row.dollarsLost, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Détail du goulot</h1>
        <p className="mt-1 text-muted-foreground">
          Toutes les zones où ton business perd de l&apos;argent, classées par impact.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={cn(
              "flex items-center justify-between rounded-3xl border p-6",
              index === 0
                ? "signature-glow border-primary/30 bg-card"
                : "border-border bg-card"
            )}
          >
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold",
                  index === 0
                    ? "bg-state-critical/10 text-state-critical"
                    : "bg-muted text-muted-foreground"
                )}
              >
                #{index + 1}
              </span>
              <div>
                <p className="font-medium">{categoryLabel(row.category)}</p>
                {index === 0 && <p className="text-sm text-primary">Goulot prioritaire</p>}
              </div>
            </div>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatUsd(row.dollarsLost)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Manque à gagner total</p>
        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-state-critical">
          {formatUsd(totalLost)}
        </p>
      </div>
    </div>
  );
}
