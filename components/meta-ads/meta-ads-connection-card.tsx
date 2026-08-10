"use client";

import { BarChart3, Check, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

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
  returnTo?: string;
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
  returnTo,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("app.ads.connection");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasWriteAccess = grantedScopes.includes("ads_management");
  const readableAccounts = accounts.filter((account) => account.canRead);
  const selectedAccount = accounts.find((account) => account.externalId === selectedAdAccountId) ?? null;
  const isInitialAccountImportPending =
    connectionNotice === "connected" &&
    accounts.length === 0 &&
    (initialSyncStatus === "pending" || initialSyncStatus === "syncing");

  useEffect(() => {
    if (!isInitialAccountImportPending) return;
    const refreshTimer = window.setInterval(() => router.refresh(), 2000);
    const stopTimer = window.setTimeout(() => window.clearInterval(refreshTimer), 15000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearTimeout(stopTimer);
    };
  }, [isInitialAccountImportPending, router]);

  const readConnectHref = returnTo ? `/api/meta/connect?return_to=${encodeURIComponent(returnTo)}` : "/api/meta/connect";

  function handleRefresh() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await refreshMetaAdAccounts();
      if (result.error) setError(result.error);
      else setNotice(`${result.imported ?? 0} ${locale === "en" ? "Meta account(s) found." : "compte(s) Meta récupéré(s)."}${result.syncTriggered ? ` ${locale === "en" ? "Campaign sync restarted." : "Synchronisation des campagnes relancée."}` : ""}`);
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
      else setNotice(locale === "en" ? "Account selected. Sync starts now." : "Compte sélectionné. La synchronisation va démarrer.");
      router.refresh();
    });
  }

  function handleDisconnect() {
    if (!window.confirm(t("disconnectConfirm"))) return;
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
              {t("description")}
            </p>
            {connected && metaUserName && <p className="mt-1 text-xs text-muted-foreground">{t("metaAccount", { name: metaUserName })}</p>}
          </div>
        </div>
        {connected && (
          <span className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap ${connectionStatus === "connected" ? "bg-state-healthy-bg text-state-healthy" : "bg-state-caution/10 text-state-caution"}`}>
            <span className={`size-2 rounded-full ${connectionStatus === "connected" ? "bg-state-healthy" : "bg-state-caution"}`} />
            {connectionStatus === "token_expired" ? t("tokenExpired") : connectionStatus === "permission_revoked" ? t("permissionRevoked") : connectionStatus === "account_inaccessible" ? t("accountInaccessible") : t("connected")}
          </span>
        )}
      </div>

      {!connected ? (
        <div className="mt-4 flex flex-col gap-3">
          {connectionStatus === "disconnected" && (
            <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              {t("disconnectedNotice")}
            </p>
          )}
          {subscriptionActive ? (
            <MetaAdsConsentDialog
              mode="read"
              href={readConnectHref}
              triggerLabel={connectionStatus === "disconnected" ? t("reconnect") : t("connect")}
            />
          ) : (
            <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t("subscriptionRequired")}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="flex flex-col gap-2 text-sm font-bold" htmlFor="meta-ad-account">
              {selectedAccount ? t("changeAccount") : t("accountToAnalyze")}
              <select
                id="meta-ad-account"
                value={selectedAdAccountId ?? ""}
                onChange={(event) => handleSelect(event.target.value)}
                disabled={isPending || readableAccounts.length === 0}
                className="h-9 rounded-[var(--radius-control)] border border-border bg-card px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                <option value="">{t("chooseAccount")}</option>
                {accounts.map((account) => (
                  <option key={account.externalId} value={account.externalId} disabled={!account.canRead}>
                    {account.name} · {maskedAccountId(account.externalId)}{account.canRead ? "" : ` · ${t("unavailableAccess")}`}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" onClick={handleRefresh} disabled={isPending}>
              <RefreshCw className={isPending ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} />
              {t("refresh")}
            </Button>
          </div>

          {selectedAccount && (
            <dl className="mt-4 grid gap-3 rounded-[var(--radius-control)] border border-border bg-muted px-3 py-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <dt className="text-xs text-muted-foreground">{t("selectedAccount")}</dt>
                <dd className="mt-1 font-bold">{selectedAccount.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("identifier")}</dt>
                <dd className="mt-1 font-mono font-bold">{maskedAccountId(selectedAccount.externalId)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("currency")}</dt>
                <dd className="mt-1 font-bold">{selectedAccount.currency ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("timezone")}</dt>
                <dd className="mt-1 font-bold">{selectedAccount.timezone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("grantedPermissions")}</dt>
                <dd className="mt-1 font-bold">{grantedScopes.length > 0 ? grantedScopes.join(", ") : "—"}</dd>
              </div>
            </dl>
          )}

          {connectionNotice === "connected" && (
            <p className="mt-4 text-sm font-bold text-state-healthy" role="status">
              {t("connectedNotice")}
            </p>
          )}
          {connectionNotice === "write_ready" && (
            <p className="mt-4 text-sm font-bold text-state-healthy" role="status">
              {t("writeReady")}
            </p>
          )}
          {connectionNotice === "write_declined" && (
            <p className="mt-4 text-sm font-bold text-state-caution" role="status">
              {t("writeDeclined")}
            </p>
          )}
          {lastSyncCompletedAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("lastSync", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastSyncCompletedAt)) })}
            </p>
          )}

          {isInitialAccountImportPending && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm text-state-healthy" role="status">
              {t("importingAccounts")}
            </p>
          )}
          {readableAccounts.length === 0 && !isInitialAccountImportPending && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              {t("noReadableAccounts")}
            </p>
          )}
          {initialSyncStatus === "awaiting_account" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              {t("chooseForSync")}
            </p>
          )}
          {(initialSyncStatus === "pending" || initialSyncStatus === "syncing") && selectedAdAccountId && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm text-state-healthy">
              <span className="font-bold">{t("syncingTitle")}</span> {t("syncingDescription")}
            </p>
          )}
          {initialSyncStatus === "completed" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy">
              <Check className="mr-1 inline size-4" />
              {t("synced")}
              {initialSyncCompletedAt && ` ${locale === "en" ? "on" : "le"} ${new Intl.DateTimeFormat(locale).format(new Date(initialSyncCompletedAt))}`}. {t("syncedFooter")}
            </p>
          )}
          {initialSyncStatus === "failed" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
              {t("syncFailed")}
            </p>
          )}
          {connectionStatus === "token_expired" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              {t("tokenExpiredHelp")}
            </p>
          )}
          {connectionStatus === "permission_revoked" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              {t("permissionRevokedHelp")}
            </p>
          )}
          {connectionStatus === "account_inaccessible" && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              {t("accountInaccessibleHelp")}
            </p>
          )}
          {!hasWriteAccess && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-border bg-muted px-3 py-3 text-sm">
              <p className="font-bold">{t("directActionsDisabled")}</p>
              <p className="mt-1 text-muted-foreground">
                {t("readOnlyHelp")}
              </p>
            </div>
          )}
          {hasWriteAccess && (
            <p className="mt-4 text-sm font-bold text-state-healthy">{t("writePermissionAvailable")}</p>
          )}
          {(error || notice) && (
            <p className={error ? "mt-4 text-sm font-bold text-state-critical" : "mt-4 text-sm font-bold text-state-healthy"}>
              {error ?? notice}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {connectionStatus !== "connected" && (
              <MetaAdsConsentDialog mode="read" href={readConnectHref} triggerLabel="Reconnecter Meta Ads" triggerVariant="outline" />
            )}
            <Button variant="outline" asChild>
              <Link href="/acquisition/ads">
                {t("viewAds")} <ExternalLink className="size-4" />
              </Link>
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>
              <Unplug className="size-4" />
              {t("disconnect")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
