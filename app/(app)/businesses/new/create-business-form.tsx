"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { createBusinessAction, type CreateBusinessState } from "../actions";

const initialState: CreateBusinessState = { error: null };

export function CreateBusinessForm({ requestId, isAdmin }: { requestId: string; isAdmin: boolean }) {
  const t = useTranslations("businesses");
  const [state, action, pending] = useActionState(createBusinessAction, initialState);
  return (
    <form action={action} aria-busy={pending} className="space-y-6">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="space-y-2">
        <label htmlFor="business-name" className="block text-sm font-bold">{t("new.name")}</label>
        <input id="business-name" name="name" autoComplete="organization" minLength={2} maxLength={100} required placeholder={t("new.namePlaceholder")} aria-invalid={Boolean(state.error)} aria-describedby={state.error ? "business-create-error" : "business-billing-notice"} className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2/20 aria-invalid:border-state-critical" />
      </div>
      <p id="business-billing-notice" className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">{isAdmin ? t("new.adminNotice") : t("new.billingNotice")}</p>
      {state.error && <p id="business-create-error" role="alert" className="text-sm text-state-critical">{state.error === "invalidName" ? t("new.invalidName") : t("new.createFailed")}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? t("new.pending") : isAdmin ? t("new.adminSubmit") : t("new.submit")}</Button>
        <Button asChild variant="outline"><Link href="/businesses">{t("new.cancel")}</Link></Button>
      </div>
    </form>
  );
}
