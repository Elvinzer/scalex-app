import { eq } from "drizzle-orm";

import { IclosedConnectionCard } from "@/components/iclosed/iclosed-connection-card";
import { db } from "@/db";
import { iclosedConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { getCurrentUser } from "@/lib/current-user";
import { getSalesCalls } from "@/lib/iclosed/calls";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";

import { CallsTable } from "./calls-table";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

function currentMonthPrefix(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)} %`;
}

export default async function PriseDappelPage() {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:appels");

  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;

  const connected = Boolean(user?.iclosedConnected);
  const [connection] = connected
    ? await db.select().from(iclosedConnections).where(eq(iclosedConnections.userId, accountId)).limit(1)
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
      <div>
        <h1 className="text-3xl font-bold">Prise d&apos;appel</h1>
        <p className="mt-1 text-muted-foreground">
          Tes appels de closing, réservés automatiquement depuis iClosed. Tu marques l&apos;issue (no-show, closé, non
          closé) et le montant ; un appel closé alimente ton CA dans le suivi des ventes.
        </p>
      </div>

      {connected && connection?.initialSyncStatus === "pending" && (
        <div className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm font-bold text-muted-foreground">
          Récupération de tes appels iClosed en cours…
        </div>
      )}
      {connected && connection?.initialSyncStatus === "failed" && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
          La synchronisation iClosed a échoué. Reconnecte iClosed depuis les intégrations pour réessayer.
        </div>
      )}

      {connected ? (
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
        <IclosedConnectionCard connected={false} subscriptionActive={subscriptionActive} primaryCta />
      ) : (
        <div className="sticker-card p-8">
          <p className="font-bold">iClosed n&apos;est pas encore connecté</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Le propriétaire du compte doit lier iClosed dans les intégrations pour activer le suivi automatique des
            appels.
          </p>
        </div>
      )}

      {(connected || calls.length > 0) && <CallsTable calls={calls} />}
    </div>
  );
}
