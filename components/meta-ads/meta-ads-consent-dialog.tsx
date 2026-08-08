"use client";

import { Check, ExternalLink, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ConsentMode = "read" | "write";

type Props = {
  mode: ConsentMode;
  href: string;
  accountLabel?: string | null;
  triggerLabel: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerClassName?: string;
};

const READ_DATA = [
  "Campagnes, ensembles de publicités et publicités",
  "Dépenses, portée, impressions, clics et conversions exposées par Meta",
  "Statuts, budgets et performances quotidiennes sur 90 jours",
];

export function MetaAdsConsentDialog({
  mode,
  href,
  accountLabel,
  triggerLabel,
  triggerVariant = "default",
  triggerClassName,
}: Props) {
  const isRead = mode === "read";
  const [isRedirecting, setIsRedirecting] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>{isRead ? "Connecter Meta Ads en lecture" : "Autoriser les actions Meta Ads"}</DialogTitle>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-accent-2/30 bg-accent-2/5 px-3 py-3 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-2" />
            <p>
              {isRead
                ? "Scale X va analyser tes performances pour produire des insights. Cette première connexion ne permet aucune modification dans Meta."
                : "Cette autorisation concerne uniquement les actions que tu confirmes depuis Scale X. Elle ne donne pas à Scale X le contrôle de tes ciblages ou de tes créatifs."}
            </p>
          </div>

          {accountLabel && (
            <p className="text-sm text-muted-foreground">
              Compte concerné : <span className="font-bold text-foreground">{accountLabel}</span>
            </p>
          )}

          {isRead ? (
            <div>
              <p className="text-sm font-bold">Données lues avec ads_read</p>
              <ul className="mt-2 flex flex-col gap-2">
                {READ_DATA.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-state-healthy" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold">Actions possibles avec ads_management</p>
              <ul className="mt-2 flex flex-col gap-2">
                {[
                  "Mettre en pause ou réactiver une campagne, un ensemble ou une publicité",
                  "Modifier le budget quotidien dans une limite de sécurité",
                  "Relire l’état dans Meta avant et après chaque écriture",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-state-healthy" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {isRead
              ? "Connexion chiffrée, révocable à tout moment. Aucun token Meta n’est envoyé au navigateur."
              : "Le consentement est séparé de la lecture. Tu peux le refuser : la lecture reste active et le lien Meta reste disponible."}
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <Button asChild variant={isRead ? "default" : "accent2"}>
              <a
                href={href}
                aria-disabled={isRedirecting}
                aria-busy={isRedirecting}
                onClick={() => setIsRedirecting(true)}
                className={isRedirecting ? "pointer-events-none opacity-70" : undefined}
              >
                {isRedirecting ? "Redirection vers Meta…" : isRead ? "Continuer vers Meta" : "Autoriser puis reprendre"}
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
