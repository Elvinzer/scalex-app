import Link from "next/link";

import { Button } from "@/components/ui/button";

// Read-only status — the actual connect/disconnect flow lives on
// /integrations (owner-only, see integrations/stripe-disconnect-button.tsx).
// This only tells
// every team member with access to /ventes/suivi whether Stripe-tagged
// sales are backed by a live sync right now. Deliberately not a coral
// Button (variant="default") here — "Ajouter une vente" is already this
// screen's one priority CTA, per the DA's one-accent-per-screen rule.
export function StripeStatusLine({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="size-1.5 rounded-full bg-state-healthy" />
        <span className="text-state-healthy">Stripe connecté · tes paiements alimentent ce suivi automatiquement</span>
        <Button asChild variant="link" size="sm" className="min-h-11">
          <Link href="/integrations#stripe">Déconnecter</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
      <span className="size-1.5 rounded-full bg-state-caution" />
      <span className="text-state-caution">Aucun compte Stripe lié — connecte-le pour suivre tes paiements automatiquement.</span>
      <Button asChild variant="outline" size="sm" className="min-h-11">
        <Link href="/integrations#stripe">Connecter Stripe</Link>
      </Button>
    </div>
  );
}
