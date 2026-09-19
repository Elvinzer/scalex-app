"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { InfoPopover } from "@/components/info-popover";

import { createActionAction } from "./crm-actions";

export function CrmActionForm({ leadId }: { leadId: string }) {
  const t = useTranslations("crm.actions");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("prospecting");
  const [dueAt, setDueAt] = useState(() => localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [idempotencyKey, setIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [draftHydrated, setDraftHydrated] = useState(false);

  function localDateTimeValue(value: Date): string {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  useEffect(() => {
    const raw = sessionStorage.getItem(`minaly.crm.action-draft:${leadId}`);
    if (!raw) {
      setDraftHydrated(true);
      return;
    }
    try {
      const draft = JSON.parse(raw) as { title?: string; category?: string; dueAt?: string; idempotencyKey?: string };
      if (typeof draft.title === "string") setTitle(draft.title);
      if (typeof draft.category === "string") setCategory(draft.category);
      if (typeof draft.dueAt === "string") setDueAt(draft.dueAt);
      if (typeof draft.idempotencyKey === "string") setIdempotencyKey(draft.idempotencyKey);
    } catch {
      sessionStorage.removeItem(`minaly.crm.action-draft:${leadId}`);
    } finally {
      setDraftHydrated(true);
    }
  }, [leadId]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (!title.trim() && category === "prospecting") {
      sessionStorage.removeItem(`minaly.crm.action-draft:${leadId}`);
      return;
    }
    sessionStorage.setItem(`minaly.crm.action-draft:${leadId}`, JSON.stringify({ title, category, dueAt, idempotencyKey }));
  }, [category, draftHydrated, dueAt, idempotencyKey, leadId, title]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const dueDate = new Date(dueAt);
    if (Number.isNaN(dueDate.getTime())) {
      setMessage(t("invalidDue"));
      return;
    }
    startTransition(async () => {
      try {
        const result = await createActionAction({ leadId, category, type: "follow_up", title, dueAt: dueDate.toISOString(), priority: 0, idempotencyKey });
        setMessage(result.error ?? t("completed"));
        if (!result.error) {
          setTitle("");
          setCategory("prospecting");
          setDueAt(localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
          setIdempotencyKey(globalThis.crypto.randomUUID());
          sessionStorage.removeItem(`minaly.crm.action-draft:${leadId}`);
        }
      } catch {
        setMessage(t("requestFailed"));
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-muted/20 p-4">
      <label className="flex flex-col gap-1 text-sm font-bold">{t("titleField")}
        <input name="title" required value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm font-bold">
          <div className="flex items-center gap-1">
            <label htmlFor="crm-action-category">{t("category")}</label>
            <InfoPopover text={t("categoryHelp")} ariaLabel={t("categoryHelpLabel")} />
          </div>
          <select id="crm-action-category" name="category" value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">
            <option value="prospecting">{t("prospecting")}</option>
            <option value="sales">{t("sales")}</option>
            <option value="appointment">{t("appointment")}</option>
          </select>
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("due")}
          <input name="dueAt" required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
        </label>
      </div>
      <Button type="submit" className="min-h-11" disabled={isPending || !title.trim()}>{isPending ? t("saving") : t("create")}</Button>
      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">{message}</p>
    </form>
  );
}
