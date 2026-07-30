import { eq } from "drizzle-orm";

import { CalendlyConnectionCard } from "@/components/calendly/calendly-connection-card";
import { IclosedConnectionCard } from "@/components/iclosed/iclosed-connection-card";
import { db } from "@/db";
import { calendlyConnections, iclosedConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { getCurrentUser } from "@/lib/current-user";
import { getSalesCalls } from "@/lib/iclosed/calls";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";

import { CallsTable } from "./calls-table";
import { RefreshCallsButton } from "./refresh-calls-button";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

function currentMonthPrefix(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

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

export default async function PriseDappelPage() {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:appels");

  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;

  const iclosedConnected = Boolean(user?.iclosedConnected);
  const calendlyConnected = Boolean(user?.calendlyConnected);
  const anyConnected = iclosedConnected || calendlyConnected;

  const [iclosedConnection] = iclosedConnected
    ? await db.select().from(iclosedConnections).where(eq(iclosedConnections.userId, accountId)).limit(1)
    : [];
  const [calendlyConnection] = calendlyConnected
    ? await db.select().from(calendlyConnections).where(eq(calendlyConnections.userId, accountId)).limit(1)
    : [];
  const [subscriptionActive, calls] = await Promise.all([hasActiveSubscription(accountId), getSalesCalls(accountId)]);

  // Funnel for the current month, computed in code (never pre-aggregated).
  const monthPrefix = currentMonthPrefix();
  const monthCalls = calls.filter((c) => c.scheduledAt.startsWith(monthPrefix));
  const reserved = monthCalls.filter((c) => c.attendance !== "cancelled").length;
  const shown = monthCalls.filter((c) => c.attendance === "showed").length;
  const noShow = monthCalls.filter((c) => c.attendance === "no_show").length;
  const closed = monthCalls.filter((c) => c.outcome === "closed").length;
  const cashCollected = monthCalls
    .filter((c) => c.outcome === "closed")
    .reduce((sum, c) => sum + (c.collected ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suivi d&apos;appel</h1>
          <p className="mt-1 text-muted-foreground">
            Tes appels de closing, réservés automatiquement depuis ton outil de prise d&apos;appel (iClosed ou Calendly).
            Tu marques l&apos;issue (no-show, closé, non closé) et le montant ; un appel closé alimente ton CA dans le
            suivi des ventes.
          </p>
        </div>
        {anyConnected && <RefreshCallsButton iclosed={iclosedConnected} calendly={calendlyConnected} />}
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

      {anyConnected ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Appels réservés ce mois</p>
            <p className="mt-2 font-display text-3xl font-bold">{reserved}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Taux de présence</p>
            <p className="mt-2 font-display text-3xl font-bold">{pct(shown, shown + noShow)}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Taux de closing</p>
            <p className="mt-2 font-display text-3xl font-bold">{pct(closed, shown)}</p>
          </div>
          <div className="sticker-card flex flex-col p-5">
            <p className="text-sm font-bold text-muted-foreground">Cash encaissé ce mois</p>
            <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(cashCollected)} €</p>
          </div>
        </div>
      ) : isOwner ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold text-muted-foreground">Choisis ton outil de prise d&apos;appel</p>
          <IclosedConnectionCard connected={false} subscriptionActive={subscriptionActive} />
          <CalendlyConnectionCard connected={false} subscriptionActive={subscriptionActive} />
        </div>
      ) : (
        <div className="sticker-card p-8">
          <p className="font-bold">Aucun outil de prise d&apos;appel n&apos;est connecté</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Le propriétaire du compte doit lier iClosed ou Calendly dans les intégrations pour activer le suivi
            automatique des appels.
          </p>
        </div>
      )}

      {(anyConnected || calls.length > 0) && <CallsTable calls={calls} />}
    </div>
  );
}
