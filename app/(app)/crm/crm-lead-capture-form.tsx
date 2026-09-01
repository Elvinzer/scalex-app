"use client";

import { FormEvent, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { Offer } from "@/lib/business/types";
import { CRM_LEAD_SOURCES, CRM_LEAD_STAGES } from "@/lib/crm/types";
import { CRM_STAGE_LABEL_KEYS } from "@/lib/crm/machine";

import { captureProfileAction } from "./crm-actions";

export function CrmLeadCaptureForm({ offers = [], setters = [] }: { offers?: Offer[]; setters?: Array<{ id: string; name: string; active: boolean }> }) {
  const t = useTranslations("crm.leads");
  const tCrm = useTranslations("crm");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const idempotencyKey = globalThis.crypto.randomUUID();
    setMessage(null);
    startTransition(async () => {
      const result = await captureProfileAction({
        profileUrl: String(form.get("profileUrl") ?? ""),
        displayName: String(form.get("displayName") ?? "") || null,
        firstName: String(form.get("firstName") ?? "") || null,
        lastName: String(form.get("lastName") ?? "") || null,
        offerId: String(form.get("offerId") ?? "") || null,
        source: String(form.get("source") ?? "instagram"),
        stage: String(form.get("stage") ?? "first_message_sent"),
        idempotencyKey,
      });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage(t("captured"));
      formElement.reset();
    });
  }

  return (
    <form onSubmit={submit} className="sticker-card flex flex-col gap-4 p-5" aria-labelledby="crm-capture-title">
      <h2 id="crm-capture-title" className="text-lg font-bold">{t("captureTitle")}</h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t("profileUrl")}
          <input name="profileUrl" required type="url" placeholder={t("profileUrlPlaceholder")} className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t("displayName")}
          <input name="displayName" type="text" className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t("firstName")}<input name="firstName" type="text" className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t("lastName")}<input name="lastName" type="text" className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t("source")}<select name="source" defaultValue="instagram" className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">{CRM_LEAD_SOURCES.map((source) => <option key={source} value={source}>{t(`sourceOptions.${source}`)}</option>)}</select></label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t("offer")}<select name="offerId" defaultValue="" className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20"><option value="">{t("noOffer")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t("stage")}<select name="stage" defaultValue="first_message_sent" className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">{CRM_LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{tCrm(CRM_STAGE_LABEL_KEYS[stage])}</option>)}</select></label>
        {setters.length > 0 && <p className="text-xs text-muted-foreground sm:col-span-2">{t("responsibleServer")}</p>}
        <Button type="submit" disabled={isPending}>{t("capture")}</Button>
      </div>
      <p className="min-h-5 text-sm font-bold text-muted-foreground" aria-live="polite">{message}</p>
    </form>
  );
}
