"use client";

import { RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FailedPaymentItem = {
  id: string;
  client: string;
  amount: number;
  reason: string;
  dueDate: string;
  attempts: number;
};

export function FailedPaymentsPanel({ items, className }: { items: FailedPaymentItem[]; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("sales");
  const [retried, setRetried] = useState<Set<string>>(new Set());
  if (items.length === 0) return null;

  const retry = (id: string) => setRetried((current) => new Set(current).add(id));
  const allRetried = items.every((item) => retried.has(item.id));

  return (
    <section className={cn("overflow-hidden rounded-[var(--radius-card)] border-2 border-accent-border bg-accent-soft", className)} aria-labelledby="failed-payments-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-border px-5 py-4">
        <div>
          <h2 id="failed-payments-title" className="text-base font-bold">
            {t("failedPaymentsTitle", { count: items.length, plural: items.length > 1 ? "s" : "" })}
          </h2>
          <p className="mt-1 text-sm text-accent-text">{new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(items.reduce((sum, item) => sum + item.amount, 0))} {t("failedPaymentsSubtitle")}</p>
        </div>
        <Button type="button" onClick={() => items.forEach((item) => retry(item.id))} disabled={allRetried}>
          <RotateCcw className="size-4" />
          {allRetried ? t("followUpsSent") : t("followUpAll")}
        </Button>
      </div>
      <div className="divide-y divide-accent-border/70 bg-card">
        {items.map((item) => {
          const sent = retried.has(item.id);
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{item.client} · {new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(item.amount)} {t("due")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.reason} · {t("dueDate", { date: item.dueDate })} · {item.attempts} {t("attempts", { plural: item.attempts > 1 ? "s" : "" })}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant={sent ? "ghost" : "outline"} size="sm" onClick={() => retry(item.id)} disabled={sent} className={cn(sent && "text-state-healthy")}>
                  {sent ? t("followUpSent") : t("followUp")}
                </Button>
                <Button type="button" variant="ghost" size="sm">{t("detail")}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
