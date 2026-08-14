"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Offer } from "@/lib/business/types";
import type { ActiveCloser } from "@/lib/closers/types";
import { LEAD_SOURCES } from "@/lib/leads/types";
import type { SetterRow } from "@/lib/setters/types";

import { createLeadAction } from "./lead-actions";

export function NewLeadDialog({ offers, setters, closers }: { offers: Offer[]; setters: SetterRow[]; closers: ActiveCloser[] }) {
  const t = useTranslations("pipeline");
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
          {t("newLead.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">{t("newLead.title")}</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("newLead.firstName")}</span>
              <input
                type="text"
                name="firstName"
                required
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("newLead.lastName")}</span>
              <input
                type="text"
                name="lastName"
                required
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("newLead.source")}</span>
            <select
              name="source"
              defaultValue="autre"
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {t(`source.${source}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("newLead.offer")}</span>
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
              <p className="text-sm text-muted-foreground">{t("newLead.noOffer")}</p>
            )}
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("newLead.potentialValue")}</span>
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
              <span className="text-muted-foreground">{t("newLead.setterOptional")}</span>
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
              <span className="text-muted-foreground">{t("newLead.closerOptional")}</span>
              <select
                name="closer"
                defaultValue={closers.find((closer) => closer.isOwner)?.name ?? closers[0]?.name ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                <option value="">—</option>
                {closers.map((closer) => (
                  <option key={closer.id} value={closer.name}>
                    {closer.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? t("newLead.saving") : t("newLead.add")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
