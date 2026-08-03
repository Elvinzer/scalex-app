"use client";

import { Plus } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Offer } from "@/lib/business/types";
import { LEAD_SOURCE_LABELS, LEAD_SOURCES } from "@/lib/leads/types";
import type { SetterRow } from "@/lib/setters/types";

import { createLeadAction } from "./lead-actions";

export function NewLeadDialog({ offers, setters }: { offers: Offer[]; setters: SetterRow[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [offerId, setOfferId] = useState("");

  function handleOfferChange(id: string) {
    setOfferId(id);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const selectedOffer = offers.find((o) => o.id === offerId);

    const data = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      source: String(formData.get("source") ?? "autre"),
      offerId: offerId || null,
      potentialValueEur: Number(formData.get("potentialValueEur") ?? selectedOffer?.price ?? 0) || 0,
      setterId: String(formData.get("setterId") ?? "") || null,
      closer: String(formData.get("closer") ?? "") || null,
      reminderDate: null,
      reminderNote: null,
    };

    startTransition(async () => {
      const result = await createLeadAction(data);
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
          Ajouter un lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Ajouter un lead</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Prénom</span>
              <input
                type="text"
                name="firstName"
                required
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Nom</span>
              <input
                type="text"
                name="lastName"
                required
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Source</span>
            <select
              name="source"
              defaultValue="autre"
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {LEAD_SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Offre visée</span>
            {offers.length > 0 ? (
              <select
                value={offerId}
                onChange={(event) => handleOfferChange(event.target.value)}
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
            <span className="text-muted-foreground">Valeur potentielle (€)</span>
            <input
              type="number"
              name="potentialValueEur"
              min={0}
              defaultValue={offers.find((o) => o.id === offerId)?.price ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Setter (optionnel)</span>
              <select
                name="setterId"
                defaultValue=""
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
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Closer (optionnel)</span>
              <input
                type="text"
                name="closer"
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : "Ajouter le lead"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
