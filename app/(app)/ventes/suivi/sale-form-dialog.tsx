"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Offer } from "@/lib/business/types";
import { generateSchedule } from "@/lib/sales/installments";
import type { SaleRow } from "@/lib/sales/types";

import { saveSale } from "./actions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SaleFormDialog({
  offers,
  sale,
  trigger,
}: {
  offers: Offer[];
  sale?: SaleRow;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedOfferId, setSelectedOfferId] = useState(sale?.offerId ?? offers.find((o) => o.isMain)?.id ?? "");
  const [totalPrice, setTotalPrice] = useState<string>(String(sale?.totalPrice ?? offers.find((o) => o.id === (sale?.offerId ?? offers.find((o2) => o2.isMain)?.id))?.price ?? ""));
  const [paymentType, setPaymentType] = useState<"one_shot" | "installments">(sale?.paymentType ?? "one_shot");
  const [installmentCount, setInstallmentCount] = useState(sale?.installments?.length ?? 3);
  const [saleDate, setSaleDate] = useState(sale?.saleDate ?? today());

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
      offerId: selectedOfferId || null,
      totalPrice: Number(totalPrice) || 0,
      paymentType,
      installments: paymentType === "installments" ? (sale?.installments && sale.paymentType === "installments" ? sale.installments : preview) : null,
      saleDate,
      closer: String(formData.get("closer") ?? "") || null,
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
          <div className="grid grid-cols-2 gap-3">
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
                Aucune offre renseignée dans Mon business — deal saisi librement.
              </p>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : sale ? "Enregistrer" : "Ajouter la vente"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
