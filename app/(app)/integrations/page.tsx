import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { CalendlyConnectionCard } from "@/components/calendly/calendly-connection-card";
import { IclosedConnectionCard } from "@/components/iclosed/iclosed-connection-card";
import { InstagramConnectionCard } from "@/components/instagram/instagram-connection-card";
import { MetaAdsConnectionCard, type MetaAdAccountOption } from "@/components/meta-ads/meta-ads-connection-card";
import { YoutubeConnectionCard } from "@/components/youtube/youtube-connection-card";
import { Button } from "@/components/ui/button";
import { ConnectedIntegrationRow } from "@/components/integrations/connected-integration-row";
import { db } from "@/db";
import {
  calendlyConnections,
  iclosedConnections,
  instagramConnections,
  metaAdAccounts,
  metaAdsConnections,
  youtubeConnections,
} from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { getCurrentUser, requireUserId } from "@/lib/current-user";
import { tryDecrypt } from "@/lib/crypto";
import { metaAdsErrorMessage } from "@/lib/meta-ads/messages";
import { requireOwnerOrRedirect } from "@/lib/team/context";
import { getAppUrl } from "@/lib/utils";

const UPCOMING_INTEGRATIONS = ["Kajabi", "Brevo"];

// Owner-only: connecting/disconnecting Stripe grants OAuth access to the
// account's real payments data — never delegable to a role.
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe_error?: string; meta_ads_error?: string; meta_ads?: string }>;
}) {
  const t = await getTranslations("app.integrations");
  const userId = await requireUserId();
  const { accountId } = await requireOwnerOrRedirect(userId);
  const { user } = await getCurrentUser();
  const stripeError = (await searchParams).stripe_error;
  const metaAdsError = (await searchParams).meta_ads_error;
  const metaAdsNotice = (await searchParams).meta_ads;
  const metaAdsErrorMessageText = metaAdsErrorMessage(metaAdsError);
  const stripeErrorMessage =
    stripeError === "config"
      ? t("stripeConfigError")
      : stripeError === "oauth"
        ? t("stripeOauthError")
        : null;
  const stripeConnected = Boolean(user?.stripeConnectId);
  const iclosedConnected = Boolean(user?.iclosedConnected);
  const calendlyConnected = Boolean(user?.calendlyConnected);
  const instagramConnected = Boolean(user?.instagramConnected);
  const youtubeConnected = Boolean(user?.youtubeConnected);

  // Independent reads — run together instead of as sequential round-trips.
  const [
    [iclosedConnection],
    [calendlyConnection],
    [instagramConnection],
    [youtubeConnection],
    [metaAdsConnection],
    metaAdAccountRows,
    subscriptionActive,
  ] = await Promise.all([
    iclosedConnected
      ? db.select().from(iclosedConnections).where(eq(iclosedConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    calendlyConnected
      ? db.select().from(calendlyConnections).where(eq(calendlyConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    instagramConnected
      ? db.select().from(instagramConnections).where(eq(instagramConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    youtubeConnected
      ? db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    db.select().from(metaAdsConnections).where(eq(metaAdsConnections.userId, accountId)).limit(1),
    db
      .select({ externalId: metaAdAccounts.externalId, name: metaAdAccounts.name, currency: metaAdAccounts.currency, timezone: metaAdAccounts.timezone, canRead: metaAdAccounts.canRead, disableReason: metaAdAccounts.disableReason })
      .from(metaAdAccounts)
      .innerJoin(metaAdsConnections, eq(metaAdsConnections.id, metaAdAccounts.connectionId))
      .where(and(eq(metaAdAccounts.userId, accountId), eq(metaAdsConnections.userId, accountId))),
    hasActiveSubscription(accountId),
  ]);
  const metaAdsConnected = Boolean(metaAdsConnection && metaAdsConnection.status !== "disconnected");
  const metaAccounts: MetaAdAccountOption[] = metaAdAccountRows;
  const iclosedTokenUnreadable = Boolean(iclosedConnection && !tryDecrypt(iclosedConnection.apiKeyEncrypted));
  const calendlyTokenUnreadable = Boolean(calendlyConnection && !tryDecrypt(calendlyConnection.accessTokenEncrypted));
  const iclosedWebhookUrl = iclosedConnection?.webhookToken
    ? `${getAppUrl()}/api/webhooks/iclosed/${iclosedConnection.webhookToken}`
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {stripeErrorMessage && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-4 py-3 text-sm font-bold text-state-critical">
          {stripeErrorMessage}
        </div>
      )}

      {metaAdsErrorMessageText && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-4 py-3 text-sm font-bold text-state-critical">
          {metaAdsErrorMessageText}
        </div>
      )}

      {(stripeConnected || metaAdsConnected || iclosedConnected || calendlyConnected || instagramConnected || youtubeConnected) && (
        <section className="flex flex-col gap-3" aria-labelledby="connected-integrations-title">
          <div>
            <h2 id="connected-integrations-title" className="text-sm font-bold text-muted-foreground">{t("connectedPlatforms")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("connectedPlatformsHelp")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {stripeConnected && (
              <ConnectedIntegrationRow
                id="stripe"
                name="Stripe"
                detail={t("connected")}
                refreshKind="stripe"
                disconnectKind="stripe"
                connectedLabel={t("connected")}
                refreshLabel={t("refresh")}
                refreshingLabel={t("refreshing")}
                refreshDoneLabel={() => t("refreshDone")}
                disconnectLabel={t("disconnect")}
              />
            )}
            {metaAdsConnected && (
              <ConnectedIntegrationRow
                id="meta"
                name="Meta Ads"
                detail={metaAdsConnection?.metaUserName ? t("connectedAs", { name: metaAdsConnection.metaUserName }) : t("connected")}
                refreshKind="meta"
                disconnectKind="meta"
                connectedLabel={t("connected")}
                refreshLabel={t("refresh")}
                refreshingLabel={t("refreshing")}
                refreshDoneLabel={(count) => t("refreshDoneCount", { count: count ?? 0 })}
                disconnectLabel={t("disconnect")}
              />
            )}
            {iclosedConnected && (
              <ConnectedIntegrationRow
                id="iclosed"
                name="iClosed"
                refreshKind="page"
                disconnectKind="iclosed"
                connectedLabel={t("connected")}
                refreshLabel={t("refresh")}
                refreshingLabel={t("refreshing")}
                refreshDoneLabel={() => t("refreshDone")}
                disconnectLabel={t("disconnect")}
              />
            )}
            {calendlyConnected && (
              <ConnectedIntegrationRow
                id="calendly"
                name="Calendly"
                refreshKind="page"
                disconnectKind="calendly"
                connectedLabel={t("connected")}
                refreshLabel={t("refresh")}
                refreshingLabel={t("refreshing")}
                refreshDoneLabel={() => t("refreshDone")}
                disconnectLabel={t("disconnect")}
              />
            )}
            {instagramConnected && (
              <ConnectedIntegrationRow
                id="instagram"
                name="Instagram"
                detail={instagramConnection?.username ? t("connectedAs", { name: `@${instagramConnection.username}` }) : t("connected")}
                refreshKind="instagram"
                disconnectKind="instagram"
                connectedLabel={t("connected")}
                refreshLabel={t("refresh")}
                refreshingLabel={t("refreshing")}
                refreshDoneLabel={(count) => t("refreshDoneCount", { count: count ?? 0 })}
                disconnectLabel={t("disconnect")}
              />
            )}
            {youtubeConnected && (
              <ConnectedIntegrationRow
                id="youtube"
                name="YouTube"
                detail={youtubeConnection?.channelTitle ? t("connectedAs", { name: youtubeConnection.channelTitle }) : t("connected")}
                refreshKind="youtube"
                disconnectKind="youtube"
                connectedLabel={t("connected")}
                refreshLabel={t("refresh")}
                refreshingLabel={t("refreshing")}
                refreshDoneLabel={(count) => t("refreshDoneCount", { count: count ?? 0 })}
                disconnectLabel={t("disconnect")}
              />
            )}
          </div>
        </section>
      )}

      {!stripeConnected && <div id="stripe" className="scroll-mt-28 sticker-card p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold">Stripe</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("stripeReadOnly")}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <a href="/api/stripe/connect">{t("connectStripe")}</a>
          </Button>
        </div>
      </div>}

      {!metaAdsConnected && <div id="meta-ads" className="scroll-mt-28">
        <MetaAdsConnectionCard
          connected={metaAdsConnected}
          connectionStatus={metaAdsConnection?.status ?? null}
          metaUserName={metaAdsConnection?.metaUserName ?? null}
          selectedAdAccountId={metaAdsConnection?.selectedAdAccountId ?? null}
          initialSyncStatus={metaAdsConnection?.initialSyncStatus ?? null}
          initialSyncCompletedAt={metaAdsConnection?.initialSyncCompletedAt ?? null}
          lastSyncCompletedAt={metaAdsConnection?.lastSyncCompletedAt ?? null}
          grantedScopes={metaAdsConnection?.grantedScopes ?? []}
          accounts={metaAccounts}
          subscriptionActive={subscriptionActive}
          connectionNotice={metaAdsNotice}
        />
      </div>}

      {(!iclosedConnected || !calendlyConnected) && <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-bold text-muted-foreground">{t("callSoftware")}</p>
          <p className="text-sm text-muted-foreground">{t("callSoftwareHelp")}</p>
        </div>
        {!iclosedConnected && <div id="iclosed" className="scroll-mt-28">
          <IclosedConnectionCard
            connected={iclosedConnected}
            initialSyncStatus={iclosedConnection?.initialSyncStatus}
            initialSyncCompletedAt={iclosedConnection?.initialSyncCompletedAt}
            webhookUrl={iclosedWebhookUrl}
            tokenUnreadable={iclosedTokenUnreadable}
            subscriptionActive={subscriptionActive}
          />
        </div>}
        {!calendlyConnected && <div id="calendly" className="scroll-mt-28">
          <CalendlyConnectionCard
            connected={calendlyConnected}
            initialSyncStatus={calendlyConnection?.initialSyncStatus}
            initialSyncCompletedAt={calendlyConnection?.initialSyncCompletedAt}
            tokenUnreadable={calendlyTokenUnreadable}
            subscriptionActive={subscriptionActive}
          />
        </div>}
      </div>}

      {(!instagramConnected || !youtubeConnected) && <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-bold text-muted-foreground">{t("content")}</p>
          <p className="text-sm text-muted-foreground">{t("contentHelp")}</p>
        </div>
        {!instagramConnected && <div id="instagram" className="scroll-mt-28">
          <InstagramConnectionCard
            connected={instagramConnected}
            username={instagramConnection?.username}
            initialSyncStatus={instagramConnection?.initialSyncStatus}
            lastSyncAt={instagramConnection?.lastInsightsSyncAt}
            subscriptionActive={subscriptionActive}
          />
        </div>}
        {!youtubeConnected && <div id="youtube" className="scroll-mt-28">
          <YoutubeConnectionCard
            connected={youtubeConnected}
            channelTitle={youtubeConnection?.channelTitle}
            initialSyncStatus={youtubeConnection?.initialSyncStatus}
            lastSyncAt={youtubeConnection?.lastAnalyticsSyncAt}
            subscriptionActive={subscriptionActive}
          />
        </div>}
      </div>}

      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-muted-foreground">{t("upcoming")}</p>
        {UPCOMING_INTEGRATIONS.map((name) => (
          <div key={name} className="sticker-card-dashed flex items-center justify-between p-6">
            <p className="font-bold text-muted-foreground">{name}</p>
            <span className="rounded-full bg-state-unknown-bg px-2.5 py-1 text-xs font-bold tracking-wide text-state-unknown uppercase">
              {t("soon")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
