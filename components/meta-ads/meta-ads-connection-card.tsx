"use client";

import { BarChart3, Check, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  disconnectMetaAds,
  refreshMetaAdAccounts,
  selectMetaAdAccount,
} from "@/app/(app)/integrations/meta-ads-actions";
import { Button } from "@/components/ui/button";
import { MetaAdsConsentDialog } from "./meta-ads-consent-dialog";

export type MetaAdAccountOption = {
  externalId: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  canRead: boolean;
  disableReason?: string | null;
};

type Props = {
  connected: boolean;
  connectionStatus: string | null;
  metaUserName: string | null;
  selectedAdAccountId: string | null;
  initialSyncStatus: string | null;
  initialSyncCompletedAt: Date | null;
  lastSyncCompletedAt: Date | null;
  grantedScopes: string[];
  accounts: MetaAdAccountOption[];
  subscriptionActive: boolean;
  connectionNotice?: string | null;
};

function maskedAccountId(externalId: string): string {
  return `••••${externalId.slice(-4)}`;
}

export function MetaAdsConnectionCard({
  connected,
  connectionStatus,
  metaUserName,
  selectedAdAccountId,
  initialSyncStatus,
  initialSyncCompletedAt,
  lastSyncCompletedAt,
  grantedScopes,
  accounts,
  subscriptionActive,
  connectionNotice,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasWriteAccess = grantedScopes.includes("ads_management");
  const readableAccounts = accounts.filter((account) => account.canRead);
  const selectedAccount = accounts.find((account) => account.externalId === selectedAdAccountId) ?? null;

  function handleRefresh() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await refreshMetaAdAccounts();
      if (result.error) setError(result.error);
      else setNotice(`${result.imported ?? 0} compte(s) Meta récupéré(s).${result.syncTriggered ? " Synchronisation des campagnes relancée." : ""}`);
      router.refresh();
    });
  }

  function handleSelect(value: string) {
    if (!value) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await selectMetaAdAccount(value);
      if (result.error) setError(result.error);
      else setNotice("Compte sélectionné. La synchronisation va démarrer.");
      router.refresh();
    });
  }

  function handleDisconnect() {
    if (!window.confirm("Déconnecter Meta Ads ? Les données déjà synchronisées resteront consultables, mais ne seront plus actualisées.")) return;
    setError(null);
    startTransition(async () => {
      const result = await disconnectMetaAds();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="sticker-card p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <BarChart3 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-bold">Meta Ads</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lecture des campagnes, coûts, créas et conversions. Les seules actions directes proposées sont la pause, la reprise et le budget quotidien ; ciblage et créas restent dans Meta Ads.
            </p>
            {connected && metaUserName && <p className="mt-1 text-xs text-muted-foreground">Compte Meta : {metaUserName}</p>}
          </div>
        </div>
        {connected && (
          <span className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap ${connectionStatus === "connected" ? "bg-state-healthy-bg text-state-healthy" : "bg-state-caution/10 text-state-caution"}`}>
            <span className={`size-2 rounded-full ${connectionStatus === "connected" ? "bg-state-healthy" : "bg-state-caution"}`} />
            {connectionStatus === "token_expired" ? "Jeton expiré" : connectionStatus === "permission_revoked" ? "Permission à renouveler" : connectionStatus === "account_inaccessible" ? "Compte inaccessible" : "Connecté"}
          </span>
        )}
      </div>

      {!connected ? (
        <div className="mt-4 flex flex-col gap-3">
          {connectionStatus === "disconnected" && (
            <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              Meta Ads est déconnecté. Les campagnes et métriques déjà synchronisées restent consultables dans Ads, mais ne seront plus actualisées tant que tu ne reconnectes pas le compte.
            </p>
          )}
          {subscriptionActive ? (
            <MetaAdsConsentDialog mode="read" href="/api/meta/connect" triggerLabel="Reconnecter Meta Ads" />
          ) : (
            <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              Un abonnement actif est nécessaire pour connecter Meta Ads.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="flex flex-col gap-2 text-sm font-bold" htmlFor="meta-ad-account">
              {selectedAccount ? "Changer de compte publicitaire" : "Compte publicitaire à analyser"}
              <select
                id="meta-ad-account"
                value={selectedAdAccountId ?? ""}
                onChange={(event) => handleSelect(event.target.value)}
                disabled={isPending || readableAccounts.length === 0}
                className="h-9 rounded-[var(--radius-control)] border border-border bg-card px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                <option value="">Choisir un compte</option>
                {accounts.map((account) => (
                  <option key={account.externalId} value={account.externalId} disabled={!account.canRead}>
                    {account.name} · {maskedAccountId(account.externalId)}{account.canRead ? "" : ` · ${account.disableReason ?? "accès indisponible"}`}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" onClick={handleRefresh} disabled={isPending}>
              <RefreshCw className={isPending ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} />
              Rafraîchir maintenant
            </Button>
          </div>

          {selectedAccount && (
            <dl className="mt-4 grid gap-3 rounded-[var(--radius-control)] border border-border bg-muted px-3 py-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <dt className="text-xs text-muted-foreground">Compte sélectionné</dt>
                <dd className="mt-1 font-bold">{selectedAccount.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Identifiant</dt>
                <dd className="mt-1 font-mono font-bold">{maskedAccountId(selectedAccount.externalId)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Devise</dt>
                <dd className="mt-1 font-bold">{selectedAccount.currency ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fuseau horaire</dt>
                <dd className="mt-1 font-bold">{selectedAccount.timezone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Permissions accordées</dt>
                <dd className="mt-1 font-bold">{grantedScopes.length > 0 ? grantedScopes.join(", ") : "—"}</dd>
              </div>
            </dl>
          )}

          {accounts.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-[var(--radius-control)] border border-border">
              <table className="w-full min-w-[38rem] text-xs">
                <thead>
                  <tr className="border-b border-border text-left font-bold text-muted-foreground">
                    <th className="px-3 py-2">Compte</th>
                    <th className="px-3 py-2">Identifiant</th>
                    <th className="px-3 py-2">Devise</th>
                    <th className="px-3 py-2">Fuseau</th>
                    <th className="px-3 py-2">Accès</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={`account-row-${account.externalId}`} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-bold">{account.name}</td>
                      <td className="px-3 py-2 font-mono">{maskedAccountId(account.externalId)}</td>
                      <td className="px-3 py-2">{account.currency ?? "—"}</td>
                      <td className="px-3 py-2">{account.timezone ?? "—"}</td>
                      <td className="px-3 py-2 font-bold">{account.canRead ? "Lecture disponible" : account.disableReason ?? "Indisponible"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {connectionNotice === "connected" && (
            <p className="mt-4 text-sm font-bold text-state-healthy" role="status">
              Connexion Meta Ads réussie. Choisis maintenant le compte publicitaire à analyser.
            </p>
          )}
          {connectionNotice === "write_ready" && (
            <p className="mt-4 text-sm font-bold text-state-healthy" role="status">
              Permission d&apos;actions Meta accordée. La proposition conservée peut maintenant être confirmée.
            </p>
          )}
          {connectionNotice === "write_declined" && (
            <p className="mt-4 text-sm font-bold text-state-caution" role="status">
              La permission d&apos;actions Meta n&apos;a pas été accordée. La lecture reste active et tu peux réessayer plus tard.
            </p>
          )}
          {lastSyncCompletedAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              Dernière synchronisation terminée le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastSyncCompletedAt))}.
            </p>
          )}

          {readableAccounts.length === 0 && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              Aucun compte publicitaire lisible n&apos;a été trouvé. Vérifie que ton utilisateur Meta a bien accès à un compte Ads.
            </p>
          )}
          {initialSyncStatus === "awaiting_account" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              Choisis le compte publicitaire à analyser pour lancer la première synchronisation.
            </p>
          )}
          {(initialSyncStatus === "pending" || initialSyncStatus === "syncing") && selectedAdAccountId && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm text-state-healthy">
              <span className="font-bold">Synchronisation en cours.</span> Les données de campagne et les 90 derniers jours d&apos;Insights seront disponibles dans Ads.
            </p>
          )}
          {initialSyncStatus === "completed" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy">
              <Check className="mr-1 inline size-4" />
              Données synchronisées
              {initialSyncCompletedAt && ` le ${new Intl.DateTimeFormat("fr-FR").format(new Date(initialSyncCompletedAt))}`}. Rafraîchissement automatique toutes les 6h.
            </p>
          )}
          {initialSyncStatus === "failed" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
              La synchronisation a échoué. Vérifie l&apos;accès du compte dans Meta Business Suite, puis actualise.
            </p>
          )}
          {connectionStatus === "token_expired" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              Le jeton Meta a expiré. Reconnecte Meta Ads pour reprendre les synchronisations ; les données déjà lues restent conservées.
            </p>
          )}
          {connectionStatus === "permission_revoked" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              Meta a retiré l’accès à ce compte publicitaire. Reconnecte Meta Ads ou vérifie les droits dans Business Suite.
            </p>
          )}
          {connectionStatus === "account_inaccessible" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              Le compte sélectionné n&apos;est plus accessible en lecture. Vérifie les droits dans Business Suite ou choisis un autre compte ; les données déjà synchronisées restent consultables.
            </p>
          )}
          {!hasWriteAccess && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-border bg-muted px-3 py-3 text-sm">
              <p className="font-bold">Actions directes désactivées</p>
              <p className="mt-1 text-muted-foreground">
                Scale X reste en lecture seule. Une permission séparée sera proposée uniquement lorsque tu prépareras une pause, une reprise ou un nouveau budget.
              </p>
            </div>
          )}
          {hasWriteAccess && (
            <p className="mt-4 text-sm font-bold text-state-healthy">Permission d&apos;actions Meta disponible — chaque modification demandera encore une confirmation.</p>
          )}
          {(error || notice) && (
            <p className={error ? "mt-4 text-sm font-bold text-state-critical" : "mt-4 text-sm font-bold text-state-healthy"}>
              {error ?? notice}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {connectionStatus !== "connected" && (
              <MetaAdsConsentDialog mode="read" href="/api/meta/connect" triggerLabel="Reconnecter Meta Ads" triggerVariant="outline" />
            )}
            <Button variant="outline" asChild>
              <Link href="/acquisition/ads">
                Voir les Ads <ExternalLink className="size-4" />
              </Link>
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>
              <Unplug className="size-4" />
              Déconnecter
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
