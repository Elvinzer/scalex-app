"use client";

import { Camera, Check, ChevronDown, ExternalLink, X } from "lucide-react";
import { useState, useTransition } from "react";

import { disconnectInstagram, refreshInstagramPosts } from "@/app/(app)/integrations/instagram-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const WHAT_WE_FETCH = [
  "Portée et impressions (quand Meta les expose)",
  "Likes, commentaires, enregistrements, partages",
  "Vues et temps de visionnage moyen (Reels/vidéos)",
  "Visites de profil et abonnements générés par le post",
  "Interactions Stories (taps, sorties, réponses)",
];

const WHAT_WE_NEVER_FETCH = ["Clics sortants sur un post ou reel organique — limitation de l'API Meta, pas un bug Scale X"];

type Props = {
  connected: boolean;
  username?: string | null;
  initialSyncStatus?: string | null;
  initialSyncCompletedAt?: Date | null;
  subscriptionActive?: boolean;
  primaryCta?: boolean;
};

export function InstagramConnectionCard({
  connected,
  username,
  initialSyncStatus,
  initialSyncCompletedAt,
  subscriptionActive = true,
  primaryCta = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectInstagram();
      if (result.error) setError(result.error);
    });
  }

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshInstagramPosts();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="sticker-card p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Camera className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-bold">Instagram</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected && username
                ? `Connecté en tant que @${username}.`
                : "Vues, likes, commentaires, enregistrements… un visuel exact de ce qui marche, post par post."}
            </p>
          </div>
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
              <span className="font-bold">✅ Instagram est connecté.</span> On récupère tes posts et leurs chiffres.
              Ils apparaîtront dans « Contenu » d&apos;ici quelques minutes.
            </div>
          )}
          {initialSyncStatus === "completed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy">
              Posts synchronisés
              {initialSyncCompletedAt &&
                ` le ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(initialSyncCompletedAt))}`}
              . Les chiffres se rafraîchissent automatiquement toutes les 6h.
            </div>
          )}
          {initialSyncStatus === "no_api_access" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              <span className="font-bold">Ce compte n&apos;est pas (ou plus) un compte Professionnel.</span> Repasse-le
              en Business ou Créateur dans l&apos;app Instagram, puis reconnecte.
            </div>
          )}
          {initialSyncStatus === "token_expired" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              La connexion a expiré. Déconnecte puis reconnecte Instagram pour continuer à recevoir tes chiffres.
            </div>
          )}
          {initialSyncStatus === "failed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
              La synchronisation a échoué. Réessaie, ou déconnecte puis reconnecte Instagram.
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={isPending}>
              {isPending ? "Rafraîchissement…" : "Rafraîchir maintenant"}
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>
              {isPending ? "Déconnexion…" : "Déconnecter"}
            </Button>
          </div>
        </>
      ) : subscriptionActive ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="mt-4" variant={primaryCta ? "default" : "outline"}>
              Connecter Instagram
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogTitle>Connecter Instagram</DialogTitle>

            <div className="mt-4 flex flex-col gap-4">
              <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2.5 text-sm text-state-caution">
                <span className="font-bold">Prérequis : un compte Instagram Professionnel</span> (Business ou
                Créateur). Un compte personnel ne peut pas donner accès à ces statistiques — c&apos;est une limite
                Instagram, pas Scale X.
              </div>

              <button
                type="button"
                onClick={() => setGuideOpen((v) => !v)}
                className="flex items-center justify-between gap-2 text-left text-sm font-bold text-muted-foreground hover:text-foreground"
              >
                Comment passer en compte Professionnel ?
                <ChevronDown className={`size-4 shrink-0 transition-transform ${guideOpen ? "rotate-180" : ""}`} />
              </button>
              {guideOpen && (
                <ol className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-muted p-3">
                  <GuideStep n={1}>Ouvre l&apos;app Instagram et va sur ton profil.</GuideStep>
                  <GuideStep n={2}>
                    Menu ☰ → <strong>Paramètres et confidentialité</strong> → <strong>Type de compte et outils</strong>.
                  </GuideStep>
                  <GuideStep n={3}>
                    Choisis <strong>Passer à un compte professionnel</strong>, puis <strong>Créateur</strong> ou{" "}
                    <strong>Entreprise</strong> selon ton activité (les deux fonctionnent ici).
                  </GuideStep>
                  <GuideStep n={4}>Termine l&apos;assistant Instagram, puis reviens ici et connecte-toi.</GuideStep>
                </ol>
              )}

              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">Ce qu&apos;on récupère</p>
                <ul className="flex flex-col gap-1.5">
                  {WHAT_WE_FETCH.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-state-healthy" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">Ce qu&apos;on ne pourra jamais récupérer</p>
                <ul className="flex flex-col gap-1.5">
                  {WHAT_WE_NEVER_FETCH.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                🔒 Ta connexion est chiffrée, en lecture seule (aucune publication possible en ton nom), et
                déconnectable à tout moment. Les chiffres se rafraîchissent automatiquement toutes les 6h.
              </p>

              {error && <p className="text-sm text-state-critical">{error}</p>}

              <Button asChild className="justify-center">
                <a href="/api/instagram/connect">
                  Connecter mon compte Instagram
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
          Le suivi de contenu nécessite un abonnement actif. Active ton abonnement pour connecter Instagram.
        </div>
      )}

      {connected && error && <p className="mt-2 text-sm text-state-critical">{error}</p>}
    </div>
  );
}

function GuideStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
        {n}
      </span>
      <div className="text-sm">{children}</div>
    </li>
  );
}
