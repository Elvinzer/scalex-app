"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useReturnFocus } from "@/components/ui/use-return-focus";
import { CRM_CALL_MATCH_STATUSES } from "@/lib/crm/types";

const CALL_SOURCES = ["iclosed", "calendly", "native", "manual"] as const;
const CALL_ATTENDANCES = ["booked", "showed", "no_show", "cancelled"] as const;
const CALL_OUTCOMES = ["pending", "closed", "not_closed", "awaiting_decision"] as const;

type CrmCallFilterSheetProps = {
  search?: string;
  source?: string;
  unlinked?: boolean;
  attendance?: string;
  outcome?: string;
  suggestion?: string;
  from?: string;
  to?: string;
  activeFilterCount: number;
};

export function CrmCallFilterSheet({ search, source, unlinked = false, attendance, outcome, suggestion, from, to, activeFilterCount }: CrmCallFilterSheetProps) {
  const t = useTranslations("crm");
  const [open, setOpen] = useState(false);
  const returnFocusProps = useReturnFocus();

  function attendanceKey(value: (typeof CALL_ATTENDANCES)[number]): "booked" | "showed" | "noShow" | "cancelled" {
    if (value === "showed") return "showed";
    if (value === "no_show") return "noShow";
    if (value === "cancelled") return "cancelled";
    return "booked";
  }

  function suggestionLabelKey(value: (typeof CRM_CALL_MATCH_STATUSES)[number]): "pending" | "candidate" | "ambiguous" | "noMatch" | "unavailable" | "failed" | "expired" | "confirmed" | "rejected" | "dismissed" {
    if (value === "queued") return "pending";
    if (value === "ready") return "candidate";
    if (value === "no_match") return "noMatch";
    if (value === "accepted") return "confirmed";
    return value;
  }

  function outcomeKey(value: (typeof CALL_OUTCOMES)[number]): "pending" | "closed" | "notClosed" | "awaitingDecision" {
    if (value === "not_closed") return "notClosed";
    if (value === "awaiting_decision") return "awaitingDecision";
    return value;
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 shrink-0">{t("calls.filters")} {activeFilterCount > 0 && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{activeFilterCount}</span>}</Button>
      </DrawerTrigger>
      <DrawerContent {...returnFocusProps} className="max-h-[90dvh] w-[min(460px,calc(100vw-2rem))] overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-3">
          <DrawerTitle className="pt-2 text-lg font-bold">{t("calls.filters")}</DrawerTitle>
          <DrawerClose asChild><Button type="button" variant="outline" className="min-h-11">{t("detail.close")}</Button></DrawerClose>
        </div>
        <form method="get" className="grid gap-3">
          <input type="hidden" name="q" value={search ?? ""} />
          <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.allSources")}<select name="source" defaultValue={source ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.allSources")}</option>{CALL_SOURCES.map((value) => <option key={value} value={value}>{t(`sources.${value}`)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.unlinkedFilter")}<select name="unlinked" defaultValue={unlinked ? "1" : ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.allCalls")}</option><option value="1">{t("calls.unlinkedFilter")}</option></select></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.attendanceFilter")}<select name="attendance" defaultValue={attendance ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.attendanceFilter")}</option>{CALL_ATTENDANCES.map((value) => <option key={value} value={value}>{t(`calls.${attendanceKey(value)}`)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.outcomeFilter")}<select name="outcome" defaultValue={outcome ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.outcomeFilter")}</option>{CALL_OUTCOMES.map((value) => <option key={value} value={value}>{t(`calls.${outcomeKey(value)}`)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.allSuggestionStates")}<select name="suggestion" defaultValue={suggestion ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.allSuggestionStates")}</option>{CRM_CALL_MATCH_STATUSES.map((value) => <option key={value} value={value}>{t(`calls.match.${suggestionLabelKey(value)}`)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.from")}<input type="date" name="from" defaultValue={from ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal" /></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.to")}<input type="date" name="to" defaultValue={to ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal" /></label>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="outline" className="min-h-11">{t("calls.applyFilters")}</Button>
            <Button asChild variant="ghost" className="min-h-11"><Link href="/crm/appels">{t("calls.resetFilters")}</Link></Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
