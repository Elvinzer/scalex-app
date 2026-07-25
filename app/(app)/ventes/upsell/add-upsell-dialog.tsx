"use client";

import { Plus } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { saveBusinessSection } from "@/app/(app)/business/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { BusinessSales } from "@/lib/business/types";

// Creates a new offer marked isUpsell directly from this page — reuses the
// exact same saveBusinessSection("sales", ...) action Mon business's
// SalesSection already calls, so it stays the single source of truth for
// business_profile.sales (no new table/action). Conversion/take-rate still
// comes from real sales referencing this offer via sales.upsellOfferId
// (unchanged) — this dialog only removes the detour through Mon business
// to create the offer in the first place.
export function AddUpsellDialog({ currentSales }: { currentSales: BusinessSales }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const name = String(formData.get("name") ?? "").trim();
    const priceRaw = formData.get("price");
    const price = priceRaw === "" || priceRaw === null ? null : Number(priceRaw);

    const newOffer = {
      id: crypto.randomUUID(),
      name,
      price,
      type: null,
      saleMode: null,
      recurrence: null,
      isMain: false,
      isUpsell: true,
    };

    startTransition(async () => {
      const result = await saveBusinessSection("sales", { ...currentSales, offers: [...currentSales.offers, newOffer] });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          Ajouter un upsell
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Ajouter un upsell</DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Le take-rate et le CA se calculent ensuite automatiquement dès qu&apos;une vente coche &quot;Upsell pris ?&quot; sur cette offre, dans Suivi des ventes.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Nom de l&apos;upsell</span>
            <input
              type="text"
              name="name"
              required
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Prix (€)</span>
            <input
              type="number"
              name="price"
              min={0}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : "Ajouter l'upsell"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
