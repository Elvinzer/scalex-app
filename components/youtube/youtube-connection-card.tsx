"use client";

import { Check, ExternalLink, MonitorPlay, X } from "lucide-react";
import { useState, useTransition } from "react";

import { disconnectYoutube, refreshYoutubeVideos } from "@/app/(app)/integrations/youtube-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const WHAT_WE_FETCH = [
  "Vues, temps de visionnage et durée de vue moyenne",
  "Taux de rétention (audience retention) par vidéo",
  "Impressions et taux de clic (CTR) sur la miniature",
  "Abonnés gagnés et perdus, par vidéo",
  "Likes, commentaires, partages",
];

const WHAT_WE_NEVER_FETCH = [
  "Clics sortants vers un lien externe — YouTube n'expose pas cette donnée pour le contenu organique (le CTR mesuré est un clic sur la miniature, pas un clic sortant)",
];

type Props = {
  connected: boolean;
  channelTitle?: string | null;
  initialSyncStatus?: string | null;
  initialSyncCompletedAt?: Date | null;
  subscriptionActive?: boolean;
  primaryCta?: boolean;
};

export function YoutubeConnectionCard({
  connected,
  channelTitle,
  initialSyncStatus,
  initialSyncCompletedAt,
  subscriptionActive = true,
  primaryCta = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDisconnect() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await disconnectYoutube();
      if (result.error) setError(result.error);
    });
  }

  function handleRefresh() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await refreshYoutubeVideos();
      if (result.error) {
        setError(result.error);
        return;
      }
      // A large never-synced backlog can take longer than one click's time
      // budget (see lib/youtube/protocol.ts's YOUTUBE_BACKFILL_TIME_BUDGET_MS)
      // — the rest keeps going in the background instead of leaving the user
      // staring at a spinner.
      if (result.completed === false) {
        setNotice("Synchronisation en cours en arrière-plan — reviens dans quelques minutes pour voir le reste de tes vidéos.");
      }
    });
  }

  return (
    <div className="sticker-card p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <MonitorPlay className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-bold">YouTube</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected && channelTitle
                ? `Connecté en tant que ${channelTitle}.`
                : "Vues, watch time, rétention, CTR… ce que ton audience regarde vraiment, vidéo par vidéo."}
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
              <span className="font-bold">✅ YouTube est connecté.</span> On récupère tes vidéos et leurs chiffres.
              Ils apparaîtront dans « Contenu » d&apos;ici quelques minutes.
            </div>
          )}
          {initialSyncStatus === "completed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy">
              Vidéos synchronisées
              {initialSyncCompletedAt &&
                ` le ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(initialSyncCompletedAt))}`}
              . Les chiffres se rafraîchissent automatiquement toutes les 6h.
            </div>
          )}
          {initialSyncStatus === "token_expired" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              La connexion a expiré ou a été révoquée. Déconnecte puis reconnecte YouTube pour continuer à recevoir tes
              chiffres.
            </div>
          )}
          {initialSyncStatus === "failed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
              La synchronisation a échoué. Réessaie, ou déconnecte puis reconnecte YouTube.
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
              Connecter YouTube
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogTitle>Connecter YouTube</DialogTitle>

            <div className="mt-4 flex flex-col gap-4">
              <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2.5 text-sm text-state-caution">
                <span className="font-bold">Prérequis : une chaîne YouTube existante</span> sur le compte Google que tu
                vas connecter. Tant que Google n&apos;a pas fini de vérifier l&apos;application Scale X, seuls les
                comptes ajoutés comme testeurs peuvent se connecter — contacte-nous si l&apos;écran Google affiche
                « application non vérifiée » et se bloque.
              </div>

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
                🔒 Ta connexion est chiffrée, en lecture seule (aucune publication ni modification possible en ton
                nom), et déconnectable à tout moment. Les chiffres se rafraîchissent automatiquement toutes les 6h.
              </p>

              {error && <p className="text-sm text-state-critical">{error}</p>}

              <Button asChild className="justify-center">
                <a href="/api/youtube/connect">
                  Connecter ma chaîne YouTube
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
          Le suivi de contenu nécessite un abonnement actif. Active ton abonnement pour connecter YouTube.
        </div>
      )}

      {connected && error && <p className="mt-2 text-sm text-state-critical">{error}</p>}
      {connected && !error && notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
    </div>
  );
}
