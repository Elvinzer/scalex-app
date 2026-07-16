// French labels for diagnostic categories written by Inngest sync jobs —
// falls back to the raw category key for any not yet mapped here.
const CATEGORY_LABELS: Record<string, string> = {
  failed_payments: "Paiements échoués",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export type DiagnosticStatus = "healthy" | "caution" | "critical";

// No absolute health-scoring model exists yet (diagnostics.score is a
// placeholder — see db/schema.ts) — status is relative to the user's own
// categories instead: worst dollar impact is critical, zero lost is
// healthy, everything else is caution.
export function diagnosticStatus(dollarsLost: number, maxDollarsLost: number): DiagnosticStatus {
  if (dollarsLost <= 0) return "healthy";
  if (dollarsLost === maxDollarsLost) return "critical";
  return "caution";
}

export const STATUS_LABELS: Record<DiagnosticStatus, string> = {
  healthy: "Sain",
  caution: "À surveiller",
  critical: "Critique",
};

// Suggested fix per category — informational only, not wired to an
// execution engine yet (lib/agent/ is unbuilt). Shown on the Agent IA page
// so the recommendation is real even before the agent can act on it.
export const CATEGORY_ACTIONS: Record<string, { title: string; description: string }> = {
  failed_payments: {
    title: "Relance automatique des paiements échoués",
    description:
      "Détection des paiements Stripe échoués + séquence de relance par email avec lien de paiement sécurisé.",
  },
};

export function categoryAction(category: string) {
  return (
    CATEGORY_ACTIONS[category] ?? {
      title: `Corriger : ${categoryLabel(category)}`,
      description: "Recommandation détaillée à venir pour cette catégorie.",
    }
  );
}
