import { Button } from "@/components/ui/button";
import { getAccountSubscription, getActivePlans } from "@/lib/billing/queries";
import { formatUsdCents } from "@/lib/currency";
import { requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trialing: "Essai en cours",
  past_due: "Paiement en retard",
  canceled: "Annulé",
  incomplete: "Incomplet",
  unpaid: "Impayé",
};

export default async function FacturationPage() {
  const userId = await requireUserId();
  const access = await requireOwnerOrRedirect(userId);

  const [subscription, plans] = await Promise.all([
    getAccountSubscription(access.accountId),
    getActivePlans(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Facturation</h1>
        <p className="mt-1 text-muted-foreground">
          Ton abonnement Scale X - nécessaire pour inviter des membres d&apos;équipe.
        </p>
      </div>

      {subscription && (
        <div className="sticker-card p-8">
          <p className="text-sm font-bold text-muted-foreground">Abonnement actuel</p>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-lg font-bold">{subscription.plan.name}</p>
            <span className="rounded-full bg-signal/15 px-3 py-1 text-xs font-bold text-signal">
              {STATUS_LABELS[subscription.status] ?? subscription.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatUsdCents(subscription.plan.priceMonthlyCents)} / mois
            {subscription.currentPeriodEnd &&
              ` — ${subscription.cancelAtPeriodEnd ? "se termine" : "renouvellement"} le ${new Date(
                subscription.currentPeriodEnd
              ).toLocaleDateString("fr-FR")}`}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <a href="/api/billing/portal">Gérer mon abonnement →</a>
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const features = plan.features as { teamMembersEnabled?: boolean; maxTeamMembers?: number | null };
          const isCurrent = subscription?.plan.id === plan.id && subscription.status !== "canceled";
          return (
            <div key={plan.id} className="sticker-card flex flex-col gap-3 p-6">
              <p className="text-sm font-bold text-muted-foreground">{plan.name}</p>
              <p className="font-display text-2xl font-bold">{formatUsdCents(plan.priceMonthlyCents)}<span className="text-sm font-normal text-muted-foreground">/mois</span></p>
              <p className="text-sm text-muted-foreground">
                {features.teamMembersEnabled
                  ? `Équipe incluse${features.maxTeamMembers ? ` (jusqu'à ${features.maxTeamMembers} membres)` : ""}`
                  : "Sans membres d'équipe"}
              </p>
              <Button asChild disabled={isCurrent} className="mt-2">
                <a href={`/api/billing/checkout?plan=${plan.key}`}>
                  {isCurrent ? "Plan actuel" : subscription ? "Changer de plan" : "S'abonner"}
                </a>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
