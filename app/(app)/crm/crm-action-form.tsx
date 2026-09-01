"use client";

import { FormEvent, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { createActionAction } from "./crm-actions";

export function CrmActionForm({ leadId }: { leadId: string }) {
  const t = useTranslations("crm.actions");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function localDateTimeValue(value: Date): string {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    setMessage(null);
    const dueAt = new Date(String(form.get("dueAt") ?? ""));
    if (Number.isNaN(dueAt.getTime())) {
      setMessage(t("invalidDue"));
      return;
    }
    startTransition(async () => {
      const result = await createActionAction({ leadId, category: String(form.get("category") ?? "prospecting"), type: "follow_up", title: String(form.get("title") ?? ""), dueAt: dueAt.toISOString(), priority: 0, idempotencyKey: globalThis.crypto.randomUUID() });
      setMessage(result.error ?? t("completed"));
      if (!result.error) formElement.reset();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-muted/20 p-4">
      <label className="flex flex-col gap-1 text-sm font-bold">{t("titleField")}
        <input name="title" required className="min-h-9 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">{t("category")}
          <select name="category" defaultValue="prospecting" className="min-h-9 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent">
            <option value="prospecting">{t("prospecting")}</option>
            <option value="sales">{t("sales")}</option>
            <option value="appointment">{t("appointment")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("due")}
          <input name="dueAt" required type="datetime-local" defaultValue={localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000))} className="min-h-9 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" />
        </label>
      </div>
      <Button type="submit" disabled={isPending}>{t("create")}</Button>
      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">{message}</p>
    </form>
  );
}
