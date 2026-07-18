import { desc, eq } from "drizzle-orm";

import { BusinessNudgeBanner } from "@/components/business-nudge-banner";
import { DiagnosticPendingState, StripeOptionalState } from "@/components/diagnostic-empty-state";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { diagnostics } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { isBusinessProfileThin } from "@/lib/business/thinness";
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
    if (!user?.stripeConnectId) {
      return (
        <StripeOptionalState
          title="Pas encore de recommandation"
          description="Connecte Stripe pour que ton agent ait un vrai goulot à te proposer de corriger."
        />
      );
    }
    return <DiagnosticPendingState />;
  }

  const hasApiKey = Boolean(user?.anthropicApiKeyEncrypted);
  const businessProfile = await getBusinessProfile(userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Agent IA</h1>
        <p className="mt-1 text-muted-foreground">
          Ce que ton agent recommande de corriger, à partir de ton propre diagnostic.
        </p>
      </div>

      {isBusinessProfileThin(businessProfile) && <BusinessNudgeBanner />}

      {!hasApiKey && (
        <div className="sticker-card border-signal p-6">
          <p className="text-sm font-bold">Ajoute ta clé API Anthropic pour activer l&apos;agent</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ton agent utilise toujours ta propre clé (BYOK), jamais une clé partagée.
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
            <div key={row.id} className="sticker-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-signal">
                    {categoryLabel(row.category)}
                    {index === 0 ? " · goulot prioritaire" : ""}
                  </p>
                  <h2 className="mt-1 text-lg font-bold">{action.title}</h2>
                </div>
                <span className="shrink-0 rounded-full bg-state-critical-bg px-3 py-1 text-sm font-bold whitespace-nowrap text-state-critical">
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
                Activer (bientôt disponible)
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
