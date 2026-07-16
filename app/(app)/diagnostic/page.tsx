import { desc, eq } from "drizzle-orm";

import { DiagnosticPendingState, StripeOptionalState } from "@/components/diagnostic-empty-state";
import { db } from "@/db";
import { diagnostics } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import {
  categoryLabel,
  diagnosticStatus,
  formatUsd,
  STATUS_LABELS,
  type DiagnosticStatus,
} from "@/lib/diagnostics";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<DiagnosticStatus, string> = {
  healthy: "bg-state-healthy/10 text-state-healthy",
  caution: "bg-state-caution/10 text-state-caution",
  critical: "bg-state-critical/10 text-state-critical",
};

export default async function DiagnosticPage() {
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
          title="Aucune catégorie diagnostiquée pour l'instant"
          description="Connecte Stripe pour faire apparaître l'état de santé réel de ton business ici."
        />
      );
    }
    return <DiagnosticPendingState />;
  }

  const maxDollarsLost = rows[0].dollarsLost;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Diagnostic</h1>
        <p className="mt-1 text-muted-foreground">
          L&apos;état de santé de chaque zone de ton business qu&apos;on surveille
          aujourd&apos;hui.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => {
          const status = diagnosticStatus(row.dollarsLost, maxDollarsLost);
          return (
            <div key={row.id} className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{categoryLabel(row.category)}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                    STATUS_STYLES[status]
                  )}
                >
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">
                {formatUsd(row.dollarsLost)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">manque à gagner détecté</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-6 text-center">
        <p className="text-sm font-medium">D&apos;autres catégories arrivent bientôt</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Acquisition, ascension et rétention rejoindront le diagnostic au fur et à mesure
          des intégrations connectées.
        </p>
      </div>
    </div>
  );
}
