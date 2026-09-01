"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ActiveCloser } from "@/lib/closers/types";
import type { Offer } from "@/lib/business/types";
import type { CrmLeadDetails } from "@/lib/crm/types";

import { validateSaleFromCrm } from "../acquisition/pipeline/validate-sale-action";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CrmSaleValidationDialog({ lead, offers, setters, closers, open, onOpenChange, onValidated }: { lead: CrmLeadDetails; offers: Offer[]; setters: Array<{ id: string; name: string; active: boolean }>; closers: ActiveCloser[]; open: boolean; onOpenChange: (open: boolean) => void; onValidated: () => void }) {
  const t = useTranslations("crm.salesValidation");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [offerId, setOfferId] = useState(lead.offerId ?? "");
  const [totalPrice, setTotalPrice] = useState(String(lead.potentialValueEur || offers.find((offer) => offer.id === lead.offerId)?.price || ""));
  const [setterId, setSetterId] = useState(lead.responsibleSetterId ?? "");
  const [closer, setCloser] = useState(lead.closer ?? closers.find((candidate) => candidate.isOwner)?.name ?? closers[0]?.name ?? "");
  const [saleDate, setSaleDate] = useState(today());
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = {
      clientName: lead.displayName,
      clientEmail: null,
      sourceChannel: lead.platform ?? lead.source,
      offerId: offerId || null,
      totalPrice: Number(totalPrice) || 0,
      paymentType: "one_shot" as const,
      paymentMethod: "virement" as const,
      installments: null,
      saleDate,
      closer: closer || null,
      hasUpsell: false,
      upsellOfferId: null,
      upsellAmount: null,
      setterId: setterId || null,
      leadId: lead.id,
      idempotencyKey,
    };
    startTransition(async () => {
      const result = await validateSaleFromCrm(lead.id, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      onValidated();
      onOpenChange(false);
    });
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogTitle>{t("title", { name: lead.displayName })}</DialogTitle><form onSubmit={submit} className="mt-4 flex flex-col gap-4"><label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">{t("offer")}</span><select value={offerId} onChange={(event) => setOfferId(event.target.value)} className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"><option value="">{t("negotiatedDeal")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">{t("totalPrice")}</span><input type="number" min={0} required value={totalPrice} onChange={(event) => setTotalPrice(event.target.value)} className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent" /></label><label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">{t("saleDate")}</span><input type="date" required max={today()} value={saleDate} onChange={(event) => setSaleDate(event.target.value)} className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">{t("setter")}</span><select value={setterId} onChange={(event) => setSetterId(event.target.value)} className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"><option value="">{t("none")}</option>{setters.filter((setter) => setter.active).map((setter) => <option key={setter.id} value={setter.id}>{setter.name}</option>)}</select></label><label className="flex flex-col gap-1.5 text-sm"><span className="text-muted-foreground">{t("closer")}</span><select value={closer} onChange={(event) => setCloser(event.target.value)} className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"><option value="">{t("none")}</option>{closers.map((candidate) => <option key={candidate.id} value={candidate.name}>{candidate.name}</option>)}</select></label></div>{error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}<Button type="submit" disabled={isPending}>{isPending ? t("saving") : t("validate")}</Button></form></DialogContent></Dialog>;
}
