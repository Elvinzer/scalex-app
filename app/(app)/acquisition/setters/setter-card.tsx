"use client";

import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import type { SetterCommissions, SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

import { saveSetter, toggleSetterActive } from "./actions";

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
  const [isActive, setIsActive] = useState(setter.active);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePctBlur() {
    const pct = (Number(pctInput) || 0) / 100;
    if (pct === setter.defaultCommissionPct) return;
    startTransition(async () => {
      await saveSetter(setter.id, { name: setter.name, email: setter.email, defaultCommissionPct: pct });
    });
  }

  function handleStatusChange() {
    setActionError(null);
    startTransition(async () => {
      const result = await toggleSetterActive(setter.id, !isActive);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setIsActive((current) => !current);
      setConfirmationOpen(false);
    });
  }

  const statusAction = isActive
    ? {
        buttonLabel: t("removeSetter"),
        title: t("removeSetterTitle", { name: setter.name }),
        description: t("removeSetterDescription"),
        confirmLabel: t("removeSetterConfirm"),
        pendingLabel: t("removingSetter"),
      }
    : {
        buttonLabel: t("reactivateSetter"),
        title: t("reactivateSetterTitle", { name: setter.name }),
        description: t("reactivateSetterDescription"),
        confirmLabel: t("reactivateSetterConfirm"),
        pendingLabel: t("reactivatingSetter"),
      };

  return (
    <div className="sticker-card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{setter.name}</p>
          {!isActive && (
            <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
              {t("inactive")}
            </span>
          )}
        </div>
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Link
          href={`/settings/equipe/setters/${setter.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11")}
        >
          {t("viewDetail")}
        </Link>
        <Button
          type="button"
          variant={isActive ? "destructive" : "outline"}
          size="sm"
          className="min-h-11"
          disabled={isPending}
          onClick={() => {
            setActionError(null);
            setConfirmationOpen(true);
          }}
          aria-busy={isPending}
        >
          {isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : isActive ? <Trash2 className="size-4" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
          {statusAction.buttonLabel}
        </Button>
      </div>

      <ConfirmationDialog
        open={confirmationOpen}
        title={statusAction.title}
        description={statusAction.description}
        confirmLabel={statusAction.confirmLabel}
        cancelLabel={t("cancel")}
        pendingLabel={statusAction.pendingLabel}
        pending={isPending}
        error={actionError}
        onCancel={() => setConfirmationOpen(false)}
        onConfirm={handleStatusChange}
      />
    </div>
  );
}
