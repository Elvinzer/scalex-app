import { Button } from "@/components/ui/button";
import { PendingRefresh } from "@/components/pending-refresh";

// Shown when diagnostics rows exist to compute but haven't landed yet
// (sync job in flight) — transient, self-resolving via PendingRefresh.
export function DiagnosticPendingState() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-sm text-muted-foreground">
        Calcul de ton goulot en cours...
      </p>
      <PendingRefresh />
    </div>
  );
}

// Shown when Stripe isn't connected yet — Stripe is optional, so this never
// blocks the page: a dismissable-feeling banner plus a placeholder card,
// not a full-screen wall.
export function StripeOptionalState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="sticker-card border-signal flex flex-col items-start justify-between gap-4 px-6 py-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-bold">Stripe n&apos;est pas encore connecté</p>
          <p className="text-sm text-muted-foreground">
            Optionnel pour explorer, connecte-le pour un vrai diagnostic basé sur tes
            données.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <a href="/api/stripe/connect">Connecter Stripe</a>
        </Button>
      </div>

      <div className="sticker-card-dashed p-10 text-center">
        <p className="text-lg font-bold">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
