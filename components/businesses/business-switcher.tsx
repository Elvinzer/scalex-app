"use client";

import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BusinessSummary } from "@/lib/businesses/queries";
import { businessHref } from "@/lib/businesses/routing";
import { cn } from "@/lib/utils";
import { hasPendingBusinessChanges } from "./pending-changes";

export function BusinessSwitcher({
  businesses,
  businessId,
  className,
  tone = "card",
}: {
  businesses: BusinessSummary[];
  businessId: string | null;
  className?: string;
  tone?: "sidebar" | "card";
}) {
  const t = useTranslations("businesses");
  const [open, setOpen] = useState(false);
  const selected = businesses.find((business) => business.id === businessId);

  useEffect(() => {
    function markDirty(event: Event) {
      const element = event.target;
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return;
      if (!element.form || (element instanceof HTMLInputElement && element.type === "search")) return;
      if (!element.form.querySelector('button[type="submit"], input[type="submit"], button:not([type])')) return;
      element.form.dataset.businessDirty = "true";
    }
    function clearDirty(event: Event) {
      if (event.target instanceof HTMLFormElement) delete event.target.dataset.businessDirty;
    }
    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("reset", clearDirty, true);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("reset", clearDirty, true);
    };
  }, []);

  function navigate(href: string) {
    if ((hasPendingBusinessChanges() || document.querySelector('form[data-business-dirty="true"]')) && !window.confirm(t("unsavedChanges"))) return;
    setOpen(false);
    // A full navigation discards business-specific client state and in-flight UI.
    // The destination carries its own context, independently of other tabs.
    window.location.assign(href);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("switcher")}
          className={cn(
            "flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2",
            tone === "sidebar" ? "border-sidebar-border text-mist hover:bg-mist/10" : "border-border bg-card text-foreground hover:bg-muted",
            className,
          )}
        >
          <Building2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{selected?.name || t("selectBusiness")}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-1.5">
        <p className="px-2.5 pb-1 pt-2 text-xs font-bold text-muted-foreground">{t("yourBusinesses")}</p>
        <div className="max-h-72 overflow-y-auto" role="list">
          {businesses.map((business) => (
            <div key={business.id} role="listitem">
              <button
                type="button"
                aria-current={business.id === businessId ? "true" : undefined}
                onClick={() => {
                  if (business.id === businessId) {
                    setOpen(false);
                    return;
                  }
                  navigate(businessHref(business.id, business.active || !business.isOwner ? "/dashboard" : "/settings/facturation"));
                }}
                className="flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{business.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {business.isOwner ? t("owner") : business.roleLabel || t("member")}
                    {!business.active && <span className="ml-2 text-state-critical">{business.isOwner ? t("paymentRequired") : t("suspended")}</span>}
                  </span>
                </span>
                {business.id === businessId && <Check className="size-4 shrink-0 text-foreground" aria-label={t("current")} />}
              </button>
            </div>
          ))}
        </div>
        <div className="my-1.5 h-px bg-border" />
        <button type="button" onClick={() => navigate("/businesses/new")} className="flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] font-bold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2">
          <Plus className="size-4" aria-hidden="true" />{t("create")}
        </button>
        <button type="button" onClick={() => navigate("/businesses")} className="flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2">
          <Building2 className="size-4" aria-hidden="true" />{t("manage")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
