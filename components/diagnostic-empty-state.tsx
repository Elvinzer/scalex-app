import { Button } from "@/components/ui/button";
import { PendingRefresh } from "@/components/pending-refresh";

// Shown by every page that depends on diagnostics rows — distinguishes
// "you haven't connected Stripe yet" (real, actionable) from "the sync job
// just hasn't landed yet" (transient, self-resolving), instead of a single
// state that reads as broken either way.
export function DiagnosticEmptyState({ stripeConnected }: { stripeConnected: boolean }) {
  if (!stripeConnected) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connecte Stripe pour démarrer
        </h1>
        <p className="max-w-md text-muted-foreground">
          Scale X a besoin d&apos;un accès en lecture à ton compte Stripe pour calculer ton
          goulot business.
        </p>
        <Button size="lg" asChild className="mt-2">
          <a href="/api/stripe/connect">Connecter Stripe</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-sm text-muted-foreground">
        Calcul de ton goulot en cours...
      </p>
      <PendingRefresh />
    </div>
  );
}
