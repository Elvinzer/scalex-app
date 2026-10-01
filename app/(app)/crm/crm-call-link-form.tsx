"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import type { CrmLeadListItem } from "@/lib/crm/types";

import { linkCallAction, searchCrmLeadsForCallAction } from "./crm-actions";
import { CrmProfileLink } from "./crm-profile-link";

export function CrmCallLinkForm({ callId, initialLeadId, initialLeadName, initialLeadProfileUrl, idPrefix = "desktop", returnTo = "/crm/appels" }: { callId: string; initialLeadId: string | null; initialLeadName: string | null; initialLeadProfileUrl: string | null; idPrefix?: string; returnTo?: string }) {
  const t = useTranslations("crm.calls");
  const crmT = useTranslations("crm");
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CrmLeadListItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<"failed" | "short" | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const linkedLeadHref = initialLeadId ? `/crm/leads/${initialLeadId}?${new URLSearchParams({ returnTo }).toString()}` : null;

  async function searchLeads(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedQuery = query.trim();
    setCandidates([]);
    setSelectedLeadId("");
    setHasSearched(false);
    setSearchError(null);
    if (trimmedQuery.length < 2) {
      setSearchError("short");
      return;
    }

    setIsSearching(true);
    try {
      const result = await searchCrmLeadsForCallAction({ query: trimmedQuery });
      if (result.state !== "ready") {
        setSearchError("failed");
        return;
      }
      setCandidates(result.leads);
      setHasSearched(true);
    } catch {
      setSearchError("failed");
    } finally {
      setIsSearching(false);
    }
  }

  function linkSelectedLead(): void {
    if (!selectedLeadId || isPending) return;
    setLinkError(null);
    startTransition(async () => {
      try {
        const result = await linkCallAction({ leadId: selectedLeadId, salesCallId: callId, confidence: "manual" });
        if (result.error) {
          setLinkError(result.error);
          return;
        }
        setMessage(t("linked"));
        setIsOpen(false);
      } catch {
        setLinkError(t("linkFailed"));
      }
    });
  }

  if (initialLeadId) {
    return <div className="flex min-h-11 items-center gap-1"><Link href={linkedLeadHref ?? "/crm/leads"} className="min-w-0 truncate font-bold underline-offset-2 hover:underline">{initialLeadName ?? t("linkedLead")}</Link><CrmProfileLink href={initialLeadProfileUrl} label={t("openProfile")} iconOnly /></div>;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild><Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => { setMessage(null); setLinkError(null); }}>{t("associateLead")}</Button></DrawerTrigger>
        <DrawerContent className="max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-4">
            <div><DrawerTitle className="text-lg font-bold">{t("associateLead")}</DrawerTitle><p className="mt-1 text-sm text-muted-foreground">{t("searchLeadsDescription")}</p></div>
            <DrawerClose asChild><Button type="button" variant="outline" className="min-h-11">{crmT("detail.close")}</Button></DrawerClose>
          </div>
          <form onSubmit={(event) => void searchLeads(event)} className="flex flex-col gap-3 sm:flex-row">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold">{t("searchLeads")}<input id={`${idPrefix}-${callId}-lead-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder={t("searchLeadsPlaceholder")} className="min-h-11 rounded border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" /></label>
            <Button type="submit" variant="outline" className="min-h-11 self-end" disabled={isSearching} aria-busy={isSearching}>{isSearching ? t("searchingLeads") : t("searchForLead")}</Button>
          </form>
          <p className="sr-only" role="status" aria-live="polite">{isSearching ? t("searchingLeads") : hasSearched ? candidates.length === 0 ? t("noLeadResults") : t("leadsFoundCount", { count: candidates.length }) : ""}</p>
          {searchError === "short" && <p className="mt-2 text-sm text-muted-foreground" role="status">{t("searchLeadHint")}</p>}
          {searchError === "failed" && <p className="mt-2 text-sm text-destructive" role="alert">{t("searchLeadsFailed")}</p>}
          {hasSearched && candidates.length === 0 && <p className="mt-4 rounded-[var(--radius-control)] border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{t("noLeadResults")}</p>}
          {candidates.length > 0 && <div className="mt-4 flex flex-col gap-2" role="group" aria-label={t("searchLeads")}>
            {candidates.map((lead) => <button key={lead.id} type="button" aria-pressed={selectedLeadId === lead.id} onClick={() => setSelectedLeadId(lead.id)} className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-card px-3 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-accent/20 aria-pressed:border-accent aria-pressed:bg-accent-soft">
              <span className="min-w-0"><span className="block truncate font-bold">{lead.displayName}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{lead.normalizedHandle ? `@${lead.normalizedHandle}` : lead.email ?? lead.phone ?? t("noContact")}{lead.responsibleSetterName ? ` · ${lead.responsibleSetterName}` : ""}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground">{lead.platform ? crmT(`sources.${lead.platform}`) : ""}</span>
            </button>)}
          </div>}
          {linkError && <p className="mt-3 text-sm text-destructive" role="alert">{linkError}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <DrawerClose asChild><Button type="button" variant="outline" className="min-h-11">{t("cancel")}</Button></DrawerClose>
            <Button type="button" variant="default" className="min-h-11" disabled={!selectedLeadId || isPending} aria-busy={isPending} onClick={linkSelectedLead}>{isPending ? t("linking") : t("link")}</Button>
          </div>
        </DrawerContent>
      </Drawer>
      {message && <span className="text-xs font-bold text-state-healthy" role="status">{message}</span>}
    </div>
  );
}
