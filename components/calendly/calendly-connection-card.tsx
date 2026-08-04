"use client";

import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { connectCalendly, disconnectCalendly } from "@/app/(app)/integrations/calendly-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CALENDLY_TOKEN_URL = "https://calendly.com/integrations/api_webhooks";

type Props = {
  connected: boolean;
  initialSyncStatus?: string | null;
  initialSyncCompletedAt?: Date | null;
  subscriptionActive?: boolean;
  primaryCta?: boolean;
};

export function CalendlyConnectionCard({
  connected,
  initialSyncStatus,
  initialSyncCompletedAt,
  subscriptionActive = true,
  primaryCta = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openWizard() {
    setStep(1);
    setValue("");
    setError(null);
    setOpen(true);
  }

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await connectCalendly(formData);
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        setValue("");
      }
    });
  }

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectCalendly();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="sticker-card p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-bold">Calendly</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Suivi automatique de tes prises d&apos;appel. Les réservations arrivent en direct ; tu marques ensuite
            l&apos;issue (no-show, closé, non closé) et les montants.
          </p>
        </div>
        {connected && (
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-state-healthy-bg px-3 py-1 text-sm font-bold whitespace-nowrap text-state-healthy">
            <span className="size-2 rounded-full bg-state-healthy" />
            Connecté
          </span>
        )}
      </div>

      {connected ? (
        <>
          {initialSyncStatus === "pending" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm text-state-healthy">
              <span className="font-bold">✅ Calendly est connecté.</span> On récupère tes rendez-vous. Ils
              apparaîtront dans l&apos;onglet « Suivi d&apos;appel » d&apos;ici quelques minutes.
            </div>
          )}
          {initialSyncStatus === "completed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy">
              Rendez-vous synchronisés
              {initialSyncCompletedAt &&
                ` le ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(initialSyncCompletedAt))}`}
              .
            </div>
          )}
          {initialSyncStatus === "no_api_access" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              <span className="font-bold">Ton jeton fonctionne, mais l&apos;accès API n&apos;est pas actif sur ton plan Calendly.</span>{" "}
              L&apos;API Calendly nécessite un plan payant. Vérifie ton plan sur calendly.com, puis reconnecte.
            </div>
          )}
          {initialSyncStatus === "failed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
              La synchronisation a échoué. Déconnecte puis reconnecte Calendly pour réessayer.
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>
              {isPending ? "Déconnexion…" : "Déconnecter"}
            </Button>
          </div>
        </>
      ) : subscriptionActive ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Pas besoin d&apos;être technique : on te guide pas à pas pour récupérer ton jeton Calendly. Ça prend une
            minute.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="mt-4" variant={primaryCta ? "default" : "outline"} onClick={openWizard}>
                Connecter Calendly
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogTitle>Connecter Calendly</DialogTitle>

              <div className="mt-1 flex items-center gap-2">
                {[1, 2].map((n) => (
                  <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-accent" : "bg-border"}`} />
                ))}
              </div>

              {step === 1 ? (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">Étape 1 sur 2 — récupère ton jeton dans Calendly :</p>
                  <ol className="flex flex-col gap-3">
                    <WizardStep n={1}>
                      Ouvre Calendly et connecte-toi.
                      <div className="mt-2">
                        <Button asChild variant="outline" size="sm">
                          <a href={CALENDLY_TOKEN_URL} target="_blank" rel="noopener noreferrer">
                            Ouvrir Calendly
                            <ExternalLink className="size-3.5" />
                          </a>
                        </Button>
                      </div>
                    </WizardStep>
                    <WizardStep n={2}>
                      Va dans <strong>Integrations &amp; apps</strong> → <strong>API &amp; Webhooks</strong>.
                    </WizardStep>
                    <WizardStep n={3}>
                      Sous <strong>Personal access tokens</strong>, clique <strong>Generate new token</strong>, nomme-le
                      « Scale X ».
                    </WizardStep>
                    <WizardStep n={4}>
                      <strong>Copie</strong> le jeton affiché (il ne sera plus visible après).
                    </WizardStep>
                  </ol>
                  <div className="mt-1 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="button" onClick={() => setStep(2)}>
                      J&apos;ai copié mon jeton
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleConnect} className="mt-4 flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">Étape 2 sur 2 — colle ton jeton Calendly ci-dessous.</p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Jeton d&apos;accès Calendly</span>
                    <input
                      type="password"
                      name="token"
                      required
                      autoFocus
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      placeholder="eyJ..."
                      className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                    />
                  </label>
                  <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    🔒 Ton jeton est chiffré et ne sera jamais réaffiché. Il sert uniquement à lire tes rendez-vous et à
                    recevoir les réservations.
                  </p>
                  {error && <p className="text-sm text-state-critical">{error}</p>}
                  <div className="flex justify-between gap-2">
                    <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={isPending}>
                      <ArrowLeft className="size-4" />
                      Retour
                    </Button>
                    <Button type="submit" disabled={isPending}>
                      {isPending ? "Connexion…" : "Connecter Calendly"}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
          Le tracking des appels nécessite un abonnement actif. Active ton abonnement pour connecter Calendly.
        </div>
      )}

      {connected && error && <p className="mt-2 text-sm text-state-critical">{error}</p>}
    </div>
  );
}

function WizardStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
        {n}
      </span>
      <div className="text-sm">{children}</div>
    </li>
  );
}
