"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { Offer } from "@/lib/business/types";
import { CRM_LEAD_SOURCES } from "@/lib/crm/types";

import { captureProfileAction } from "./crm-actions";

export function CrmLeadCaptureForm({ offers = [], setters = [] }: { offers?: Offer[]; setters?: Array<{ id: string; name: string; active: boolean }> }) {
  const t = useTranslations("crm.leads");
  void offers;
  void setters;
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"instagram" | "linkedin">("instagram");
  const [source, setSource] = useState("instagram");
  const [sourceWasEdited, setSourceWasEdited] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  useEffect(() => {
    const saved = sessionStorage.getItem("minaly.crm.capture-draft");
    if (!saved) return;
    try {
      const draft = JSON.parse(saved) as { identity?: string; displayName?: string; platform?: "instagram" | "linkedin"; source?: string; idempotencyKey?: string };
      const form = document.querySelector<HTMLFormElement>("[data-crm-capture-form]");
      if (!form) return;
      const identityInput = form.elements.namedItem("identity");
      const displayNameInput = form.elements.namedItem("displayName");
      if (identityInput instanceof HTMLInputElement && draft.identity) identityInput.value = draft.identity;
      if (displayNameInput instanceof HTMLInputElement && draft.displayName) displayNameInput.value = draft.displayName;
      if (draft.platform) setPlatform(draft.platform);
      if (draft.source) {
        setSource(draft.source);
        setSourceWasEdited(true);
      } else if (draft.platform) {
        setSource(draft.platform);
      }
      if (draft.idempotencyKey) setIdempotencyKey(draft.idempotencyKey);
      sessionStorage.removeItem("minaly.crm.capture-draft");
    } catch {
      sessionStorage.removeItem("minaly.crm.capture-draft");
    }
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const identity = String(form.get("identity") ?? "").trim();
    const isUrl = /^https?:\/\//i.test(identity);
    sessionStorage.setItem("minaly.crm.capture-draft", JSON.stringify({ identity, displayName: String(form.get("displayName") ?? ""), platform, source, idempotencyKey }));
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await captureProfileAction({
          profileUrl: isUrl ? identity : "",
          handle: isUrl ? null : identity,
          platform,
          displayName: String(form.get("displayName") ?? "") || null,
          firstName: String(form.get("firstName") ?? "") || null,
          lastName: String(form.get("lastName") ?? "") || null,
          offerId: String(form.get("offerId") ?? "") || null,
          source,
          idempotencyKey,
        });
        if (result.error) {
          setMessage(result.error);
          return;
        }
        setMessage(t("captured"));
        formElement.reset();
        setPlatform("instagram");
        setSource("instagram");
        setSourceWasEdited(false);
        setIdempotencyKey(globalThis.crypto.randomUUID());
        sessionStorage.removeItem("minaly.crm.capture-draft");
      } catch {
        setMessage(t("requestFailed"));
      }
    });
  }

  return (
    <form onSubmit={submit} data-crm-capture-form className="sticker-card flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="crm-capture-title">
      <h2 id="crm-capture-title" className="text-lg font-bold">{t("captureTitle")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] lg:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t("profileOrHandle")}
          <input name="identity" required inputMode="url" autoComplete="off" placeholder={t("profileUrlPlaceholder")} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t("platform")}
          <select name="platform" value={platform} onChange={(event) => { const nextPlatform = event.target.value as "instagram" | "linkedin"; setPlatform(nextPlatform); if (!sourceWasEdited) setSource(nextPlatform); }} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20"><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option></select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t("displayName")}
          <input name="displayName" type="text" className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">{t("source")}<select name="source" value={source} onChange={(event) => { setSource(event.target.value); setSourceWasEdited(true); }} className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">{CRM_LEAD_SOURCES.map((sourceOption) => <option key={sourceOption} value={sourceOption}>{t(`sourceOptions.${sourceOption}`)}</option>)}</select></label>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">{t("newLeadHint")}</p>
        <Button type="submit" disabled={isPending} className="min-h-11 sm:col-span-2 lg:col-span-1">{isPending ? t("capturing") : t("capture")}</Button>
      </div>
      <p className="min-h-5 text-sm font-bold text-muted-foreground" aria-live="polite">{message}</p>
    </form>
  );
}
