"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import type { Offer } from "@/lib/business/types";
import { crmCaptureDraftSchema, restoreCrmDraft } from "@/lib/crm/drafts";
import { CRM_CHANNELS, CRM_LEAD_SOURCES, type CrmChannel, type CrmLeadSource } from "@/lib/crm/types";

const captureResponseSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("saved"), error: z.null(), leadId: z.string().uuid().optional(), created: z.boolean().optional() }),
  z.object({ state: z.literal("error"), error: z.string().min(1) }),
]);

export function CrmLeadCaptureForm({ offers = [], setters = [], hideTitle = false }: { offers?: Offer[]; setters?: Array<{ id: string; name: string; active: boolean }>; hideTitle?: boolean }) {
  const t = useTranslations("crm.leads");
  const router = useRouter();
  void offers;
  void setters;
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [platform, setPlatform] = useState<CrmChannel>("instagram");
  const [source, setSource] = useState<CrmLeadSource>("instagram");
  const [sourceWasEdited, setSourceWasEdited] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  useEffect(() => {
    const draft = restoreCrmDraft(sessionStorage, "minaly.crm.capture-draft", crmCaptureDraftSchema);
    if (!draft) return;
    try {
      const form = document.querySelector<HTMLFormElement>("[data-crm-capture-form]");
      if (!form) return;
      const identityInput = form.elements.namedItem("identity");
      const displayNameInput = form.elements.namedItem("displayName");
      if (identityInput instanceof HTMLInputElement && draft.identity) identityInput.value = draft.identity;
      if (displayNameInput instanceof HTMLInputElement && draft.displayName) displayNameInput.value = draft.displayName;
      const draftPlatform = CRM_CHANNELS.find((candidate) => candidate === draft.platform);
      const draftSource = CRM_LEAD_SOURCES.find((candidate) => candidate === draft.source);
      if (draftPlatform) setPlatform(draftPlatform);
      if (draftSource) {
        setSource(draftSource);
        setSourceWasEdited(true);
      } else if (draftPlatform) {
        setSource(draftPlatform);
      }
      if (draft.idempotencyKey) setIdempotencyKey(draft.idempotencyKey);
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
    saveDraft(formElement);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/crm/leads/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileUrl: isUrl ? identity : "",
            handle: isUrl ? null : identity,
            platform,
            displayName: String(form.get("displayName") ?? "") || null,
            firstName: String(form.get("firstName") ?? "") || null,
            lastName: String(form.get("lastName") ?? "") || null,
            offerId: String(form.get("offerId") ?? "") || null,
            source,
            idempotencyKey,
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        const result = captureResponseSchema.safeParse(payload);
        if (!result.success) {
          setMessage(t("requestFailed"));
          return;
        }
        if (result.data.state === "error") {
          setMessage(result.data.error);
          return;
        }
        setMessage(t("captured"));
        formElement.reset();
        setPlatform("instagram");
        setSource("instagram");
        setSourceWasEdited(false);
        setIdempotencyKey(globalThis.crypto.randomUUID());
        sessionStorage.removeItem("minaly.crm.capture-draft");
        router.refresh();
      } catch {
        setMessage(t("requestFailed"));
      }
    });
  }

  function saveDraft(formElement: HTMLFormElement): void {
    const form = new FormData(formElement);
    sessionStorage.setItem("minaly.crm.capture-draft", JSON.stringify({
      identity: String(form.get("identity") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
      platform: String(form.get("platform") ?? platform),
      source: String(form.get("source") ?? source),
      idempotencyKey,
    }));
  }

  return (
    <form onSubmit={submit} onChange={(event) => saveDraft(event.currentTarget)} data-crm-capture-form className="sticker-card flex flex-col gap-4 p-4 sm:p-5" aria-labelledby={hideTitle ? undefined : "crm-capture-title"}>
      {!hideTitle && <h2 id="crm-capture-title" className="text-lg font-bold">{t("captureTitle")}</h2>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] lg:items-start">
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t("profileOrHandle")}
          <input name="identity" required inputMode="url" autoComplete="off" placeholder={t("profileUrlPlaceholder")} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          <span>{t("channel")}</span>
          <select name="platform" value={platform} onChange={(event) => { const nextPlatform = CRM_CHANNELS.find((candidate) => candidate === event.target.value) ?? "instagram"; setPlatform(nextPlatform); if (!sourceWasEdited) setSource(nextPlatform); }} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">{CRM_CHANNELS.map((platformOption) => <option key={platformOption} value={platformOption}>{t(`sourceOptions.${platformOption}`)}</option>)}</select>
          <span className="text-xs font-normal leading-5 text-muted-foreground">{t("channelHelp")}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t("displayName")}
          <input name="displayName" type="text" className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          <span>{t("source")}</span>
          <select name="source" value={source} onChange={(event) => { const nextSource = CRM_LEAD_SOURCES.find((candidate) => candidate === event.target.value) ?? "instagram"; setSource(nextSource); setSourceWasEdited(true); }} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">{CRM_LEAD_SOURCES.map((sourceOption) => <option key={sourceOption} value={sourceOption}>{t(`sourceOptions.${sourceOption}`)}</option>)}</select>
          <span className="text-xs font-normal leading-5 text-muted-foreground">{t("sourceHelp")}</span>
        </label>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-1 lg:mt-6">{t("newLeadHint")}</p>
        <Button type="submit" disabled={isPending} className="min-h-11 sm:col-span-2 lg:col-span-1 lg:mt-6 lg:self-start">{isPending ? t("capturing") : t("capture")}</Button>
      </div>
      <p className="min-h-5 text-sm font-bold text-muted-foreground" aria-live="polite">{message}</p>
    </form>
  );
}
