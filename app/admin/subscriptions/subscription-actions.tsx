"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { createAdminBillingPortalLink, resyncAdminSubscription } from "./actions";

export function SubscriptionActions({ accountId, hasStripeSubscription, hasStripeCustomer }: { accountId: string; hasStripeSubscription: boolean; hasStripeCustomer: boolean }) {
  const router = useRouter();
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalMessage, setPortalMessage] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [resyncMessage, setResyncMessage] = useState<string | null>(null);
  const [resyncError, setResyncError] = useState<string | null>(null);
  const [isPortalPending, startPortalTransition] = useTransition();
  const [isResyncPending, startResyncTransition] = useTransition();

  function generatePortalLink() {
    setPortalUrl(null);
    setPortalMessage(null);
    setPortalError(null);
    startPortalTransition(async () => {
      try {
        const result = await createAdminBillingPortalLink(accountId);
        if (result.error) setPortalError(result.error);
        else {
          setPortalMessage(result.message ?? "Lien généré.");
          setPortalUrl(result.url ?? null);
        }
      } catch {
        setPortalError("La session fondateur n’est plus valide. Recharge la page puis réessaie.");
      }
    });
  }

  function resync() {
    setResyncMessage(null);
    setResyncError(null);
    startResyncTransition(async () => {
      try {
        const result = await resyncAdminSubscription(accountId);
        if (result.error) setResyncError(result.error);
        else {
          setResyncMessage(result.message ?? "Projection resynchronisée.");
          router.refresh();
        }
      } catch {
        setResyncError("La session fondateur n’est plus valide. Recharge la page puis réessaie.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-bold">Billing Portal</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Génère une session Stripe temporaire pour laisser le client gérer son abonnement.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11"
          onClick={generatePortalLink}
          disabled={isPortalPending}
          aria-busy={isPortalPending}
        >
          {isPortalPending ? "Génération…" : "Générer un lien temporaire"}
        </Button>
        {!hasStripeCustomer && <p className="mt-2 text-xs text-muted-foreground">Aucun client Stripe connu : l’action retournera une erreur sans appeler Stripe.</p>}
        {portalMessage && <p className="mt-3 text-sm font-bold text-state-healthy" role="status">{portalMessage}</p>}
        {portalError && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{portalError}</p>}
        {portalUrl && (
          <Button asChild variant="secondary" className="mt-3 min-h-11">
            <a href={portalUrl} target="_blank" rel="noreferrer">
              Ouvrir le portail Stripe <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-sm font-bold">Projection locale</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Recharge l’état et le Price depuis Stripe sans modifier l’abonnement.
        </p>
        <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={resync} disabled={isResyncPending || !hasStripeSubscription} aria-busy={isResyncPending}>
          <RefreshCw className={isResyncPending ? "size-4 animate-spin" : "size-4"} />
          {isResyncPending ? "Synchronisation…" : "Resynchroniser depuis Stripe"}
        </Button>
        {!hasStripeSubscription && <p className="mt-2 text-xs text-muted-foreground">Aucun abonnement Stripe synchronisable pour ce compte.</p>}
        {resyncMessage && <p className="mt-3 text-sm font-bold text-state-healthy" role="status">{resyncMessage}</p>}
        {resyncError && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{resyncError}</p>}
      </div>
      {(isPortalPending || isResyncPending) && (
        <p className="sr-only" role="status" aria-live="polite">
          {isPortalPending ? "Génération du lien Billing Portal en cours." : "Resynchronisation Stripe en cours."}
        </p>
      )}
    </div>
  );
}
