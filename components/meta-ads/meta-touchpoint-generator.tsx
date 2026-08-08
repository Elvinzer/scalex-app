"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState, useTransition } from "react";

import { createMetaCampaignTrackingLink } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";

export function MetaTouchpointGenerator({
  campaignId,
  landingPageUrl,
}: {
  campaignId: string;
  landingPageUrl: string | null;
}) {
  const [destinationUrl, setDestinationUrl] = useState(landingPageUrl ?? "");
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setMessage(null);
    startTransition(async () => {
      const result = await createMetaCampaignTrackingLink({ campaignId, destinationUrl });
      if (result.error || !result.url) {
        setTrackingUrl(null);
        setMessage(result.error ?? "Le lien n'a pas pu être créé.");
        return;
      }
      setTrackingUrl(result.url);
      try {
        await navigator.clipboard.writeText(result.url);
        setMessage("Lien copié. Colle-le dans l’URL de destination de la publicité Meta.");
      } catch {
        setMessage("Lien créé. Copie-le depuis le champ ci-dessous.");
      }
    });
  }

  async function copyLink() {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setMessage("Lien copié.");
    } catch {
      setMessage("Sélectionne le lien pour le copier.");
    }
  }

  return (
    <section className="sticker-card p-6" aria-labelledby="meta-touchpoint-title">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 size-5 shrink-0 text-accent-2" />
        <div>
          <h2 id="meta-touchpoint-title" className="font-bold">Mesurer les leads et ventes de cette campagne</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Génère une URL à utiliser dans Meta Ads. Le jeton opaque relie la visite à la campagne, puis au formulaire, à l’appel et à la vente quand ces étapes sont renseignées dans Scale X.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="meta-destination-url" className="mb-1 block text-xs font-bold text-muted-foreground">URL de destination</label>
          <input
            id="meta-destination-url"
            type="url"
            value={destinationUrl}
            onChange={(event) => setDestinationUrl(event.target.value)}
            placeholder="https://ton-site.com/page"
            className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          />
        </div>
        <Button variant="accent2" onClick={generate} disabled={isPending || !destinationUrl.trim()}>
          <Link2 className="size-4" />
          {isPending ? "Création…" : "Créer le lien"}
        </Button>
      </div>
      {trackingUrl && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            aria-label="Lien de suivi Meta créé"
            readOnly
            value={trackingUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground outline-none"
          />
          <Button variant="outline" onClick={copyLink}>
            {message === "Lien copié." ? <Check className="size-4" /> : <Copy className="size-4" />}
            Copier
          </Button>
        </div>
      )}
      {message && <p className="mt-3 text-sm font-bold text-muted-foreground" role="status">{message}</p>}
    </section>
  );
}
