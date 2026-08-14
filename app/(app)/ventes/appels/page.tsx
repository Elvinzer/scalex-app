import { eq } from "drizzle-orm";

import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { CalendlyConnectionCard } from "@/components/calendly/calendly-connection-card";
import { IclosedConnectionCard } from "@/components/iclosed/iclosed-connection-card";
import { IntegrationStatusRow, type IntegrationStatus } from "@/components/integration-status-row";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodFilter } from "@/components/period-filter";
import { db } from "@/db";
import { calendlyConnections, iclosedConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { getActiveClosers } from "@/lib/closers/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getSalesCalls } from "@/lib/iclosed/calls";
import { dateFromDayString, isInPeriod, resolvePeriod } from "@/lib/period";
import { summarize } from "@/lib/sales/installments";
import { getSales } from "@/lib/sales/queries";
import { getSetters } from "@/lib/setters/queries";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";

import { CallsTable } from "./calls-table";
import { CallsFreshnessProbe } from "./calls-freshness-probe";
import { ManualCallDialog } from "./manual-call-dialog";

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)} %`;
}

function connectionStatus(status?: string | null): IntegrationStatus {
  if (status === "pending") return "syncing";
  if (status === "no_api_access") return "plan_limited";
  if (status === "failed") return "error";
  return "connected";
}

export default async function PriseDappelPage({ searchParams }: { searchParams: Promise<{ period?: string; call?: string; from?: string }> }) {
  const locale = await getLocale();
  const t = await getTranslations("app.calls");
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:appels");

  const params = await searchParams;
  const period = resolvePeriod(params.period);
  const fromDashboard = params.from === "dashboard";
  const targetCallId = z.string().uuid().safeParse(params.call).success ? params.call ?? null : null;

  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;

  const iclosedConnected = Boolean(user?.iclosedConnected);
  const calendlyConnected = Boolean(user?.calendlyConnected);
  const anyConnected = iclosedConnected || calendlyConnected;

  const [[iclosedConnection], [calendlyConnection], subscriptionActive, calls, setters, closers, sales] = await Promise.all([
    iclosedConnected
      ? db.select().from(iclosedConnections).where(eq(iclosedConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    calendlyConnected
      ? db.select().from(calendlyConnections).where(eq(calendlyConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    hasActiveSubscription(accountId),
    getSalesCalls(accountId),
    getSetters(accountId),
    getActiveClosers(accountId),
    getSales(accountId),
  ]);

  // Funnel for the selected period, computed in code (never pre-aggregated).
  const periodCalls = calls.filter((c) => isInPeriod(period, new Date(c.scheduledAt)));
  const activePeriodCalls = periodCalls.filter((c) => c.attendance !== "cancelled");
  const periodSales = sales.filter((sale) => !sale.isOrphan && isInPeriod(period, dateFromDayString(sale.saleDate)));
  const reserved = activePeriodCalls.length;
  const shown = activePeriodCalls.filter((c) => c.attendance === "showed").length;
  const noShow = activePeriodCalls.filter((c) => c.attendance === "no_show").length;
  const closed = periodSales.length > 0 ? periodSales.length : activePeriodCalls.filter((c) => c.outcome === "closed").length;
  const notClosed = Math.max(shown - closed, 0);
  const cashCollected = periodSales.length > 0
    ? periodSales.reduce((sum, sale) => sum + summarize(sale.totalPrice, sale.installments).paidTotal, 0)
    : activePeriodCalls
      .filter((c) => c.outcome === "closed")
      .reduce((sum, c) => sum + (c.collected ?? 0), 0);

  // Awaiting-decision calls are the live relance to-do — surfaced across ALL
  // periods (a due date is forward-looking), not just the selected one.
  const pendingDecisions = calls.filter((c) => c.outcome === "awaiting_decision");

  return (
    <div className="flex flex-col gap-8">
      <CallsFreshnessProbe enabled={Boolean(iclosedConnection)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suivi d&apos;appel</h1>
              <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {fromDashboard && (
            <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-muted-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-accent/20">
              ← {t("backDashboard")}
            </Link>
          )}
          {(anyConnected || calls.length > 0) && <PeriodFilter current={period.key} />}
          <ManualCallDialog setters={setters} closers={closers} />
        </div>
      </div>

      {anyConnected && (
        <section aria-label={t("connectedIntegrations")} className="grid gap-3 sm:grid-cols-2">
          {iclosedConnected && (
            <IntegrationStatusRow
              name="iClosed"
              status={connectionStatus(iclosedConnection?.initialSyncStatus)}
              detail={t(`connection.${iclosedConnection?.initialSyncStatus === "pending" ? "pending" : iclosedConnection?.initialSyncStatus === "no_api_access" ? "limited" : iclosedConnection?.initialSyncStatus === "failed" ? "failed" : "ready"}`, { tool: "iClosed" })}
              action={
                <Link
                  href="/integrations#iclosed"
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
                >
                  {t("manage")}
                </Link>
              }
            />
          )}
          {calendlyConnected && (
            <IntegrationStatusRow
              name="Calendly"
              status={connectionStatus(calendlyConnection?.initialSyncStatus)}
              detail={t(`connection.${calendlyConnection?.initialSyncStatus === "pending" ? "pending" : calendlyConnection?.initialSyncStatus === "no_api_access" ? "limited" : calendlyConnection?.initialSyncStatus === "failed" ? "failed" : "ready"}`, { tool: "Calendly" })}
              action={
                <Link
                  href="/integrations#calendly"
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
                >
                  {t("manage")}
                </Link>
              }
            />
          )}
        </section>
      )}

      {(anyConnected || calls.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label={t("reservedCalls")} value={new Intl.NumberFormat(locale).format(reserved)} detail={t("periodDetail")} />
          <KpiTile
            label={t("showRate")}
            value={pct(shown, shown + noShow)}
            tone="positive"
            info={{ ariaLabel: t("showRateInfo"), content: t("showRateHelp") }}
          />
          <KpiTile
            label={t("closingRate")}
            value={pct(closed, closed + notClosed)}
            tone="accent2"
            info={{ ariaLabel: t("closingRateInfo"), content: t("closingRateHelp") }}
          />
          <KpiTile label={t("cashCollected")} value={new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cashCollected)} detail={t("periodDetail")} tone="positive" />
        </div>
      )}

      {/* Connect prompt — independent of the stats above: still offered even
          once manual calls exist (automating sync is still worth it), but
          never blocks seeing/using the page while disconnected. */}
      {!anyConnected &&
        (isOwner ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-muted-foreground">
              {calls.length > 0
                ? t("automatePrompt")
                : t("chooseToolPrompt")}
            </p>
            <IclosedConnectionCard connected={false} subscriptionActive={subscriptionActive} />
            <CalendlyConnectionCard connected={false} subscriptionActive={subscriptionActive} />
          </div>
        ) : (
          calls.length === 0 && (
            <div className="sticker-card p-8">
              <p className="font-bold">{t("noToolConnected")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("noToolHelp")}
              </p>
            </div>
          )
        ))}

      {(anyConnected || calls.length > 0) && (
        <CallsTable calls={periodCalls} pendingDecisions={pendingDecisions} closers={closers} initialCallId={targetCallId} />
      )}
    </div>
  );
}
