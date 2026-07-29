"use client";

import { useState, useTransition, type FormEvent } from "react";

import { connectIclosed, disconnectIclosed } from "@/app/(app)/integrations/iclosed-actions";
import { Button } from "@/components/ui/button";

type Props = {
  connected: boolean;
  initialSyncStatus?: string | null;
  initialSyncCompletedAt?: Date | null;
  // When true the account has no active subscription — the connect form is
  // replaced by an upsell note (the Server Action would reject it anyway).
  subscriptionActive?: boolean;
};

export function IclosedConnectionCard({
  connected,
  initialSyncStatus,
  initialSyncCompletedAt,
  subscriptionActive = true,
}: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await connectIclosed(formData);
      if (result.error) setError(result.error);
      else setValue("");
    });
  }

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectIclosed();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold">iClosed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Suivi automatique de tes prises d&apos;appel. Les réservations arrivent en direct ; tu marques ensuite
            l&apos;issue (no-show, closé, non closé) et les montants.
          </p>
        </div>
        {connected && (
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-state-healthy-bg px-3 py-1 text-sm font-bold whitespace-nowrap text-state-healthy">
            <span className="size-2 rounded-full bg-state-healthy" />
            Connecté
          </span>
        )}
      </div>

      {connected ? (
        <>
          {initialSyncStatus === "pending" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm font-bold text-muted-foreground">
              Récupération de tes appels en cours…
            </div>
          )}
          {initialSyncStatus === "completed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy">
              Appels synchronisés
              {initialSyncCompletedAt &&
                ` le ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(initialSyncCompletedAt))}`}
              .
            </div>
          )}
          {initialSyncStatus === "failed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
              La synchronisation a échoué. Déconnecte puis reconnecte iClosed pour réessayer.
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>
              {isPending ? "Déconnexion…" : "Déconnecter"}
            </Button>
          </div>
        </>
      ) : subscriptionActive ? (
        <form onSubmit={handleConnect} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">
              Clé API iClosed (iClosed → Settings → Developers → API Keys)
            </span>
            <input
              type="password"
              name="apiKey"
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="iclosed_..."
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Ta clé est chiffrée et n&apos;est jamais réaffichée. Elle sert uniquement à lire tes appels et à recevoir les
            réservations.
          </p>
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Connexion…" : "Connecter iClosed"}
          </Button>
        </form>
      ) : (
        <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
          Le tracking des appels nécessite un abonnement actif. Active ton abonnement pour connecter iClosed.
        </div>
      )}

      {error && <p className="mt-2 text-sm text-state-critical">{error}</p>}
    </div>
  );
}
