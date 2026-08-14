"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Offer } from "@/lib/business/types";
import type { ActiveCloser } from "@/lib/closers/types";
import { type LeadRow } from "@/lib/leads/types";
import { generateSchedule } from "@/lib/sales/installments";
import type { SetterRow } from "@/lib/setters/types";

import { validateSaleFromLead } from "./validate-sale-action";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Pre-filled variant of /ventes/suivi's SaleFormDialog, opened when a lead
// is dragged to "Closé" — same fields/schema (saleInputSchema via
// validateSaleFromLead), controlled from the outside (no DialogTrigger:
// the Kanban's drag handler opens it programmatically, not a click).
export function SaleValidationDialog({
  lead,
  offers,
  setters,
  closers,
  open,
  onOpenChange,
}: {
  lead: LeadRow;
  offers: Offer[];
  setters: SetterRow[];
  closers: ActiveCloser[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("pipeline");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initialOffer = offers.find((o) => o.id === lead.offerId);
  const [selectedOfferId, setSelectedOfferId] = useState(lead.offerId ?? "");
  const [totalPrice, setTotalPrice] = useState<string>(String(lead.potentialValueEur || initialOffer?.price || ""));
  const [setterId, setSetterId] = useState(lead.setterId ?? "");
  const [closer, setCloser] = useState(lead.closer ?? closers.find((closer) => closer.isOwner)?.name ?? closers[0]?.name ?? "");
  const [saleDate, setSaleDate] = useState(today());
  const [paymentType, setPaymentType] = useState<"one_shot" | "installments">("one_shot");
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "virement">("virement");
  const [installmentCount, setInstallmentCount] = useState(3);

  const preview = useMemo(() => {
    if (paymentType !== "installments") return null;
    return generateSchedule(Number(totalPrice) || 0, installmentCount, saleDate);
  }, [paymentType, totalPrice, installmentCount, saleDate]);

  function handleOfferChange(offerId: string) {
    setSelectedOfferId(offerId);
    const offer = offers.find((o) => o.id === offerId);
    if (offer?.price !== null && offer?.price !== undefined) setTotalPrice(String(offer.price));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const data = {
      clientName: `${lead.firstName} ${lead.lastName}`.trim(),
      clientEmail: null,
      sourceChannel: t(`source.${lead.source}`),
      offerId: selectedOfferId || null,
      totalPrice: Number(totalPrice) || 0,
      paymentType,
      paymentMethod,
      installments: paymentType === "installments" ? preview : null,
      saleDate,
      closer: closer || null,
      hasUpsell: false,
      upsellOfferId: null,
      upsellAmount: null,
      setterId: setterId || null,
      leadId: lead.id,
    };

    startTransition(async () => {
      const result = await validateSaleFromLead(lead.id, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">{t("saleValidation.title", { name: `${lead.firstName} ${lead.lastName}` })}</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("saleValidation.offer")}</span>
            {offers.length > 0 ? (
              <select
                value={selectedOfferId}
                onChange={(event) => handleOfferChange(event.target.value)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                <option value="">{t("saleValidation.negotiatedDeal")}</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">{t("saleValidation.noOffer")}</p>
            )}
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("saleValidation.totalPrice")}</span>
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
              <span className="text-muted-foreground">{t("saleValidation.saleDate")}</span>
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
              <span className="text-muted-foreground">{t("saleValidation.setter")}</span>
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
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("saleValidation.closerOptional")}</span>
              <select
                value={closer}
                onChange={(event) => setCloser(event.target.value)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                <option value="">—</option>
                {lead.closer && !closers.some((candidate) => candidate.name === lead.closer) && (
                  <option value={lead.closer}>{lead.closer}</option>
                )}
                {closers.map((candidate) => (
                  <option key={candidate.id} value={candidate.name}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("saleValidation.payment")}</span>
            <div className="flex gap-1.5">
              <Button type="button" variant={paymentType === "one_shot" ? "default" : "outline"} size="sm" onClick={() => setPaymentType("one_shot")}>
                {t("saleValidation.oneShot")}
              </Button>
              <Button type="button" variant={paymentType === "installments" ? "default" : "outline"} size="sm" onClick={() => setPaymentType("installments")}>
                {t("saleValidation.installments")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("saleValidation.paymentMethod")}</span>
            <div className="flex gap-1.5">
              <Button type="button" variant={paymentMethod === "virement" ? "default" : "outline"} size="sm" onClick={() => setPaymentMethod("virement")}>
                {t("saleValidation.transfer")}
              </Button>
              <Button type="button" variant={paymentMethod === "stripe" ? "default" : "outline"} size="sm" onClick={() => setPaymentMethod("stripe")}>
                {t("saleValidation.stripe")}
              </Button>
            </div>
          </div>

          {paymentType === "installments" && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("saleValidation.installmentCount")}</span>
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
            {isPending ? t("saleValidation.saving") : t("saleValidation.validate")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
