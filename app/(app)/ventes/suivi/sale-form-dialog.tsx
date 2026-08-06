"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Offer } from "@/lib/business/types";
import { generateSchedule } from "@/lib/sales/installments";
import type { SaleRow } from "@/lib/sales/types";
import type { SetterRow } from "@/lib/setters/types";

import { saveSale } from "./actions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SaleFormDialog({
  offers,
  setters,
  sale,
  trigger,
  youtubeVideos = [],
  currentVideoId = null,
}: {
  offers: Offer[];
  setters: SetterRow[];
  sale?: SaleRow;
  trigger: React.ReactNode;
  // Public YouTube videos, most recent first — the choices for "which video
  // brought this client". Empty when YouTube isn't connected, in which case
  // the whole field is hidden rather than shown as an empty select.
  youtubeVideos?: { videoId: string; title: string }[];
  // Existing DECLARED attribution for this sale, so editing shows it.
  currentVideoId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedOfferId, setSelectedOfferId] = useState(sale?.offerId ?? offers.find((o) => o.isMain)?.id ?? "");
  const [sourceVideoId, setSourceVideoId] = useState(currentVideoId ?? "");
  const [totalPrice, setTotalPrice] = useState<string>(String(sale?.totalPrice ?? offers.find((o) => o.id === (sale?.offerId ?? offers.find((o2) => o2.isMain)?.id))?.price ?? ""));
  const [paymentType, setPaymentType] = useState<"one_shot" | "installments">(sale?.paymentType ?? "one_shot");
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "virement">(sale?.paymentMethod ?? "virement");
  const [installmentCount, setInstallmentCount] = useState(sale?.installments?.length ?? 3);
  const [saleDate, setSaleDate] = useState(sale?.saleDate ?? today());
  const [hasUpsell, setHasUpsell] = useState(sale?.hasUpsell ?? false);
  const [upsellOfferId, setUpsellOfferId] = useState(sale?.upsellOfferId ?? "");
  const [upsellAmount, setUpsellAmount] = useState<string>(sale?.upsellAmount !== null && sale?.upsellAmount !== undefined ? String(sale.upsellAmount) : "");
  const [setterId, setSetterId] = useState(sale?.setterId ?? "");

  const preview = useMemo(() => {
    if (paymentType !== "installments") return null;
    const price = Number(totalPrice) || 0;
    return generateSchedule(price, installmentCount, saleDate);
  }, [paymentType, totalPrice, installmentCount, saleDate]);

  function handleOfferChange(offerId: string) {
    setSelectedOfferId(offerId);
    const offer = offers.find((o) => o.id === offerId);
    if (offer?.price !== null && offer?.price !== undefined) {
      setTotalPrice(String(offer.price));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const data = {
      clientName: String(formData.get("clientName") ?? ""),
      clientEmail: String(formData.get("clientEmail") ?? "") || null,
      sourceChannel: String(formData.get("sourceChannel") ?? "") || null,
      // Read from state, not FormData: the field is conditionally rendered,
      // so FormData wouldn't carry it when YouTube isn't connected.
      sourceVideoId: sourceVideoId || null,
      offerId: selectedOfferId || null,
      totalPrice: Number(totalPrice) || 0,
      paymentType,
      paymentMethod,
      installments: paymentType === "installments" ? (sale?.installments && sale.paymentType === "installments" ? sale.installments : preview) : null,
      saleDate,
      closer: String(formData.get("closer") ?? "") || null,
      hasUpsell,
      upsellOfferId: hasUpsell ? upsellOfferId || null : null,
      upsellAmount: hasUpsell ? Number(upsellAmount) || 0 : null,
      setterId: setterId || null,
      // Preserved on edit (a sale created from the Pipeline keeps its link
      // back to the lead); manual sales never had one to begin with.
      leadId: sale?.leadId ?? null,
    };

    startTransition(async () => {
      const result = await saveSale(sale?.id ?? null, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">{sale ? "Modifier la vente" : "Ajouter une vente"}</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Client</span>
              <input
                type="text"
                name="clientName"
                required
                defaultValue={sale?.clientName ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Email (optionnel)</span>
              <input
                type="email"
                name="clientEmail"
                defaultValue={sale?.clientEmail ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Offre</span>
            {offers.length > 0 ? (
              <select
                value={selectedOfferId}
                onChange={(event) => handleOfferChange(event.target.value)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                <option value="">Deal négocié (hors offres)</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune offre renseignée dans Mon business, deal saisi librement.
              </p>
            )}
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Prix total (€)</span>
              <input
                type="number"
                min={0}
                required
                value={totalPrice}
                onChange={(event) => setTotalPrice(event.target.value)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Date de vente</span>
              <input
                type="date"
                required
                max={today()}
                value={saleDate}
                onChange={(event) => setSaleDate(event.target.value)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Canal source (optionnel)</span>
              <input
                type="text"
                name="sourceChannel"
                defaultValue={sale?.sourceChannel ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Closer (optionnel)</span>
              <input
                type="text"
                name="closer"
                defaultValue={sale?.closer ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          {/* Declared attribution — the ONLY input the Contenu insights
              treat as fact. Hidden entirely when YouTube isn't connected:
              an empty select would suggest data we can't offer. */}
          {youtubeVideos.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Vidéo YouTube à l&apos;origine (optionnel)</span>
              <select
                value={sourceVideoId}
                onChange={(event) => setSourceVideoId(event.target.value)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                <option value="">Je ne sais pas</option>
                {youtubeVideos.map((video) => (
                  <option key={video.videoId} value={video.videoId}>
                    {video.title}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Sert à mesurer ce que ton contenu rapporte vraiment. Laisse sur « Je ne sais pas » si tu n&apos;es pas sûr —
                une réponse au hasard fausserait le calcul.
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Setter (optionnel)</span>
            <select
              value={setterId}
              onChange={(event) => setSetterId(event.target.value)}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              <option value="">—</option>
              {setters.map((setter) => (
                <option key={setter.id} value={setter.id}>
                  {setter.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Paiement</span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant={paymentType === "one_shot" ? "default" : "outline"}
                size="sm"
                onClick={() => setPaymentType("one_shot")}
              >
                Paiement unique
              </Button>
              <Button
                type="button"
                variant={paymentType === "installments" ? "default" : "outline"}
                size="sm"
                onClick={() => setPaymentType("installments")}
              >
                Échelonné
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Moyen de paiement</span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant={paymentMethod === "virement" ? "default" : "outline"}
                size="sm"
                onClick={() => setPaymentMethod("virement")}
              >
                Virement
              </Button>
              <Button
                type="button"
                variant={paymentMethod === "stripe" ? "default" : "outline"}
                size="sm"
                onClick={() => setPaymentMethod("stripe")}
              >
                Stripe
              </Button>
            </div>
          </div>

          {paymentType === "installments" && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Nombre d&apos;échéances</span>
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={installmentCount}
                  onChange={(event) => setInstallmentCount(Number(event.target.value) || 2)}
                  className="w-20 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
              </label>
              {preview && (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {preview.map((installment, index) => (
                    <li key={index}>
                      {installment.dueDate} — {installment.amount} €
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasUpsell}
                onChange={(event) => setHasUpsell(event.target.checked)}
                className="size-4"
              />
              <span>Upsell pris ?</span>
            </label>

            {hasUpsell && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Offre d&apos;upsell</span>
                  {offers.length > 0 ? (
                    <select
                      value={upsellOfferId}
                      onChange={(event) => setUpsellOfferId(event.target.value)}
                      className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                    >
                      <option value="">—</option>
                      {offers.map((offer) => (
                        <option key={offer.id} value={offer.id}>
                          {offer.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucune offre renseignée dans Mon business.</p>
                  )}
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Montant upsell (€)</span>
                  <input
                    type="number"
                    min={0}
                    value={upsellAmount}
                    onChange={(event) => setUpsellAmount(event.target.value)}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                </label>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : sale ? "Enregistrer" : "Ajouter la vente"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
