import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";

const UPCOMING_INTEGRATIONS = ["Kajabi", "Brevo", "Calendly"];

export default async function IntegrationsPage() {
  const { user } = await getCurrentUser();
  const stripeConnected = Boolean(user?.stripeConnectId);

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
