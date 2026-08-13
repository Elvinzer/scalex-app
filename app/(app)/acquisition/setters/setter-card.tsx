"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import type { SetterCommissions, SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

import { saveSetter } from "./actions";

export function SetterCard({
  setter,
  summary,
}: {
  setter: SetterRow;
  summary: Pick<SetterCommissions, "validatedSalesCount" | "validatedRevenueEur" | "commissionPaidEur" | "commissionUpcomingEur">;
}) {
  const locale = useLocale();
  const t = useTranslations("app.setters");
  const [pctInput, setPctInput] = useState(String(Math.round(setter.defaultCommissionPct * 100)));
  const [isPending, startTransition] = useTransition();

  function handlePctBlur() {
    const pct = (Number(pctInput) || 0) / 100;
    if (pct === setter.defaultCommissionPct) return;
    startTransition(async () => {
      await saveSetter(setter.id, { name: setter.name, email: setter.email, defaultCommissionPct: pct });
    });
  }

  return (
    <div className="sticker-card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">{setter.name}</p>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="number"
            min={0}
            max={100}
            value={pctInput}
            onChange={(event) => setPctInput(event.target.value)}
            onBlur={handlePctBlur}
            disabled={isPending}
            aria-label={t("defaultCommission")}
            className="w-14 rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus-visible:border-accent"
          />
          %
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">{t("salesSet")}</p>
          <p className="font-bold tabular-nums">{summary.validatedSalesCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("revenueSet")}</p>
          <p className="font-bold tabular-nums">{formatEur(summary.validatedRevenueEur, locale)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("paidCommission")}</p>
          <p className="font-bold tabular-nums text-state-healthy">{formatEur(summary.commissionPaidEur, locale)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("upcomingCommission")}</p>
          <p className="font-bold tabular-nums text-state-caution">{formatEur(summary.commissionUpcomingEur, locale)}</p>
        </div>
      </div>

      <Link
        href={`/settings/equipe/setters/${setter.id}`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
      >
        {t("viewDetail")}
      </Link>
    </div>
  );
}
