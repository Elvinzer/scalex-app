import { desc, eq } from "drizzle-orm";
import { Bot, Sparkles, Target } from "lucide-react";

import { DiagnosticPendingState, StripeOptionalState } from "@/components/diagnostic-empty-state";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { diagnostics } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { categoryLabel, formatUsd } from "@/lib/diagnostics";

export default async function DashboardPage() {
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
          title="Pas encore de goulot détecté"
          description="Connecte Stripe pour voir ici le manque à gagner réel de ton business."
        />
      );
    }
    return <DiagnosticPendingState />;
  }

  const [topBottleneck] = rows;
  const totalLost = rows.reduce((sum, row) => sum + row.dollarsLost, 0);
  const firstName = user?.email.split("@")[0] || "là";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="gradient-text text-4xl font-semibold">Salut, {firstName}</h1>
        <p className="mt-1.5 text-muted-foreground">
          Voici où en est ton business — et ce qu&apos;il faut corriger en premier.
        </p>
      </div>

      <div className="signature-glow relative overflow-hidden rounded-4xl border border-border bg-card p-10">
        <p className="text-sm font-medium text-muted-foreground">
          Manque à gagner total détecté
        </p>
        <p className="mt-3 font-mono text-6xl font-semibold tabular-nums text-state-critical sm:text-7xl">
          {formatUsd(totalLost)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          sur {rows.length} {rows.length > 1 ? "zones identifiées" : "zone identifiée"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-3xl border border-border bg-card p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-state-critical/10 text-state-critical">
                <Target className="size-4.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-state-critical">Ton goulot actuel</p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {categoryLabel(topBottleneck.category)}
                </h2>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-state-critical/10 px-3 py-1 text-sm font-medium whitespace-nowrap text-state-critical">
              {formatUsd(topBottleneck.dollarsLost)}
            </span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            C&apos;est la zone qui te coûte le plus aujourd&apos;hui — corrige-la en premier
            pour l&apos;impact le plus rapide sur ton chiffre d&apos;affaires.
          </p>
          <Button size="lg" asChild className="mt-6">
            <a href="/closing">Voir le détail →</a>
          </Button>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-8">
          <span className="flex size-9 items-center justify-center rounded-xl bg-violet/10 text-violet">
            <Sparkles className="size-4.5" />
          </span>
          <p className="mt-4 font-mono text-4xl font-semibold tabular-nums">{rows.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length > 1 ? "zones suivies" : "zone suivie"} — connecte d&apos;autres sources
            dans Réglages pour élargir le diagnostic.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gain/10 text-gain">
              <Bot className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-medium">Ton agent IA</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Voir la recommandation détaillée pour ton goulot actuel.
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <a href="/agent">Voir l&apos;agent →</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
