import { eq } from "drizzle-orm";

import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getCurrentUser, requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";

const UPCOMING_INTEGRATIONS = ["Kajabi", "Brevo", "Calendly"];

// Owner-only: connecting/disconnecting Stripe grants OAuth access to the
// account's real payments data — never delegable to a role.
export default async function IntegrationsPage() {
  const userId = await requireUserId();
  const { accountId } = await requireOwnerOrRedirect(userId);
  const { user } = await getCurrentUser();
  const stripeConnected = Boolean(user?.stripeConnectId);

  const [connection] = stripeConnected
    ? await db.select().from(stripeConnections).where(eq(stripeConnections.userId, accountId)).limit(1)
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Intégrations</h1>
        <p className="mt-1 text-muted-foreground">
          Les sources de données que Scale X utilise pour ton diagnostic.
        </p>
      </div>

      <div className="sticker-card p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-bold">Stripe</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Accès en lecture seule à tes paiements. C&apos;est la source principale du
              diagnostic.
            </p>
          </div>
          {stripeConnected ? (
            <span className="flex shrink-0 items-center gap-2 rounded-full bg-state-healthy-bg px-3 py-1 text-sm font-bold whitespace-nowrap text-state-healthy">
              <span className="size-2 rounded-full bg-state-healthy" />
              Connecté
            </span>
          ) : (
            <Button asChild className="shrink-0">
              <a href="/api/stripe/connect">Connecter Stripe</a>
            </Button>
          )}
        </div>

        {stripeConnected && connection && !connection.livemode && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
            Ce compte Stripe est en mode test — aucune synchronisation ne sera effectuée pour éviter de mélanger des
            données test et réelles. Reconnecte un compte en mode live.
          </div>
        )}

        {stripeConnected && connection?.livemode && connection.initialSyncStatus === "pending" && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm font-bold text-muted-foreground">
            Synchronisation de tes 12 derniers mois en cours…
          </div>
        )}

        {stripeConnected && connection?.livemode && connection.initialSyncStatus === "completed" && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy">
            12 mois synchronisés
            {connection.initialSyncCompletedAt && ` le ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(connection.initialSyncCompletedAt)}`}
            .
          </div>
        )}

        {stripeConnected && connection?.livemode && connection.initialSyncStatus === "failed" && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
            La synchronisation a échoué. Déconnecte puis reconnecte Stripe pour réessayer.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-muted-foreground">À venir</p>
        {UPCOMING_INTEGRATIONS.map((name) => (
          <div key={name} className="sticker-card-dashed flex items-center justify-between p-6">
            <p className="font-bold text-muted-foreground">{name}</p>
            <span className="rounded-full bg-state-unknown-bg px-2.5 py-1 text-xs font-bold tracking-wide text-state-unknown uppercase">
              Bientôt
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
