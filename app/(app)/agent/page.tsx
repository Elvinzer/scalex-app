import { desc, eq } from "drizzle-orm";

import { DiagnosticEmptyState } from "@/components/diagnostic-empty-state";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { diagnostics } from "@/db/schema";
import { categoryAction, categoryLabel, formatUsd } from "@/lib/diagnostics";
import { getCurrentUser } from "@/lib/current-user";

export default async function AgentPage() {
  const { userId, user } = await getCurrentUser();

  const rows = await db
    .select()
    .from(diagnostics)
    .where(eq(diagnostics.userId, userId))
    .orderBy(desc(diagnostics.dollarsLost));

  if (rows.length === 0) {
    return <DiagnosticEmptyState stripeConnected={Boolean(user?.stripeConnectId)} />;
  }

  const hasApiKey = Boolean(user?.anthropicApiKeyEncrypted);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Agent IA</h1>
        <p className="mt-1 text-muted-foreground">
          Ce que ton agent recommande de corriger, à partir de ton propre diagnostic.
        </p>
      </div>

      {!hasApiKey && (
        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6">
          <p className="text-sm font-medium">Ajoute ta clé API Anthropic pour activer l&apos;agent</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ton agent utilise toujours ta propre clé (BYOK) — jamais une clé partagée.
          </p>
          <Button asChild className="mt-4">
            <a href="/settings">Ajouter ma clé →</a>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const action = categoryAction(row.category);
          return (
            <div key={row.id} className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-primary">
                    {categoryLabel(row.category)}
                    {index === 0 ? " · goulot prioritaire" : ""}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight">
                    {action.title}
                  </h2>
                </div>
                <span className="shrink-0 rounded-full bg-state-critical/10 px-3 py-1 text-sm font-medium whitespace-nowrap text-state-critical">
                  {formatUsd(row.dollarsLost)}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{action.description}</p>
              <Button
                variant="outline"
                disabled={!hasApiKey}
                className="mt-4"
                title={
                  hasApiKey
                    ? "L'exécution automatique arrive bientôt"
                    : "Ajoute ta clé Anthropic dans Réglages pour débloquer cette action"
                }
              >
                Activer — bientôt disponible
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
