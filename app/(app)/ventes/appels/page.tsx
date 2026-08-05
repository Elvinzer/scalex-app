import { eq } from "drizzle-orm";

import Link from "next/link";
import { z } from "zod";

import { CalendlyConnectionCard } from "@/components/calendly/calendly-connection-card";
import { IclosedConnectionCard } from "@/components/iclosed/iclosed-connection-card";
import { PeriodFilter } from "@/components/period-filter";
import { db } from "@/db";
import { calendlyConnections, iclosedConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { getCurrentUser } from "@/lib/current-user";
import { getSalesCalls } from "@/lib/iclosed/calls";
import { isInPeriod, resolvePeriod } from "@/lib/period";
import { getSetters } from "@/lib/setters/queries";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";

import { CallsTable } from "./calls-table";
import { ManualCallDialog } from "./manual-call-dialog";
import { RefreshCallsButton } from "./refresh-calls-button";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)} %`;
}

// Per-tool sync banner (pending / plan-gated / failed). Rendered for each
// connected source so a problem on either tool is surfaced distinctly.
function SyncStatus({ tool, status, planText }: { tool: string; status?: string | null; planText: string }) {
  if (status === "pending") {
    return (
      <div className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm font-bold text-muted-foreground">
        Récupération de tes appels {tool} en cours…
      </div>
    );
  }
  if (status === "no_api_access") {
    return (
      <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
        <span className="font-bold">Accès API {tool} non actif.</span> {planText}
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
        La synchronisation {tool} a échoué. Reconnecte {tool} depuis les intégrations pour réessayer.
      </div>
    );
  }
  return null;
}

export default async function PriseDappelPage({ searchParams }: { searchParams: Promise<{ period?: string; call?: string; from?: string }> }) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:appels");

  const params = await searchParams;
  const period = resolvePeriod(params.period);
  const fromDashboard = params.from === "dashboard";
  const targetCallId = z.string().uuid().safeParse(params.call).success ? params.call ?? null : null;

  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const canSeeVideos = isOwner || (context !== null && context.permissions !== "all" && context.permissions.has("ventes:videos"));

  const iclosedConnected = Boolean(user?.iclosedConnected);
  const calendlyConnected = Boolean(user?.calendlyConnected);
  const anyConnected = iclosedConnected || calendlyConnected;

  const [[iclosedConnection], [calendlyConnection], subscriptionActive, calls, setters] = await Promise.all([
    iclosedConnected
      ? db.select().from(iclosedConnections).where(eq(iclosedConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    calendlyConnected
      ? db.select().from(calendlyConnections).where(eq(calendlyConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    hasActiveSubscription(accountId),
    getSalesCalls(accountId),
    getSetters(accountId),
  ]);

  // Funnel for the selected period, computed in code (never pre-aggregated).
  const periodCalls = calls.filter((c) => isInPeriod(period, new Date(c.scheduledAt)));
  const reserved = periodCalls.filter((c) => c.attendance !== "cancelled").length;
  const shown = periodCalls.filter((c) => c.attendance === "showed").length;
  const noShow = periodCalls.filter((c) => c.attendance === "no_show").length;
  const closed = periodCalls.filter((c) => c.outcome === "closed").length;
  const notClosed = periodCalls.filter((c) => c.outcome === "not_closed").length;
  const cashCollected = periodCalls
    .filter((c) => c.outcome === "closed")
    .reduce((sum, c) => sum + (c.collected ?? 0), 0);

  // Awaiting-decision calls are the live relance to-do — surfaced across ALL
  // periods (a due date is forward-looking), not just the selected one.
  const pendingDecisions = calls.filter((c) => c.outcome === "awaiting_decision");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suivi d&apos;appel</h1>
          <p className="mt-1 text-muted-foreground">
            Tes appels de closing, réservés automatiquement depuis ton outil de prise d&apos;appel (iClosed ou Calendly),
            ou ajoutés à la main si tu n&apos;en as pas. Tu marques l&apos;issue (no-show, non closé, attente décision,
            closé) et le montant ; un appel closé alimente ton CA dans le suivi des ventes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {fromDashboard && (
            <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-muted-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-accent/20">
              ← Retour au Dashboard
            </Link>
          )}
          <Link href="/ventes/appels/funnel" className="text-sm font-bold text-muted-foreground hover:underline">
            Funnel de closing →
          </Link>
          {canSeeVideos && (
            <Link href="/ventes/appels/videos" className="text-sm font-bold text-muted-foreground hover:underline">
              Vidéos de closing →
            </Link>
          )}
          {(anyConnected || calls.length > 0) && <PeriodFilter current={period.key} />}
          {anyConnected && <RefreshCallsButton iclosed={iclosedConnected} calendly={calendlyConnected} />}
          <ManualCallDialog setters={setters} />
        </div>
      </div>

      {iclosedConnected && (
        <SyncStatus
          tool="iClosed"
          status={iclosedConnection?.initialSyncStatus}
          planText="L'API iClosed nécessite un plan Business ou Enterprise. Vérifie ton plan sur iclosed.io, puis reconnecte."
        />
      )}
      {calendlyConnected && (
        <SyncStatus
          tool="Calendly"
          status={calendlyConnection?.initialSyncStatus}
          planText="L'API Calendly nécessite un plan payant. Vérifie ton plan sur calendly.com, puis reconnecte."
        />
      )}

      {(anyConnected || calls.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Appels réservés</p>
            <p className="mt-2 font-display text-3xl font-bold">{reserved}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Taux de présence</p>
            <p className="mt-2 font-display text-3xl font-bold">{pct(shown, shown + noShow)}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Taux de closing</p>
            <p className="mt-2 font-display text-3xl font-bold">{pct(closed, closed + notClosed)}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Cash encaissé</p>
            <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(cashCollected)} €</p>
          </div>
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
                ? "Envie d'automatiser la réservation de tes appels ?"
                : "Choisis ton outil de prise d'appel, ou ajoute tes appels manuellement ci-dessus"}
            </p>
            <IclosedConnectionCard connected={false} subscriptionActive={subscriptionActive} />
            <CalendlyConnectionCard connected={false} subscriptionActive={subscriptionActive} />
          </div>
        ) : (
          calls.length === 0 && (
            <div className="sticker-card p-8">
              <p className="font-bold">Aucun outil de prise d&apos;appel n&apos;est connecté</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Le propriétaire du compte peut lier iClosed ou Calendly dans les intégrations pour activer le suivi
                automatique des appels, ou ajoute tes appels manuellement ci-dessus en attendant.
              </p>
            </div>
          )
        ))}

      {(anyConnected || calls.length > 0) && (
        <CallsTable calls={periodCalls} pendingDecisions={pendingDecisions} initialCallId={targetCallId} />
      )}
    </div>
  );
}
