"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { CrmLeadListItem } from "@/lib/crm/types";

import { linkCallAction } from "./crm-actions";

export function CrmCallLinkForm({ callId, initialLeadId, leads, idPrefix = "desktop" }: { callId: string; initialLeadId: string | null; leads: CrmLeadListItem[]; idPrefix?: string }) {
  const t = useTranslations("crm.calls");
  const [leadId, setLeadId] = useState(initialLeadId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!leadId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await linkCallAction({ leadId, salesCallId: callId, confidence: "manual" });
      setMessage(result.error ?? t("linked"));
    });
  }

  if (initialLeadId) {
    return <Link href={`/crm/leads/${initialLeadId}`} className="font-bold underline-offset-2 hover:underline">{leads.find((lead) => lead.id === initialLeadId)?.displayName ?? t("linkedLead")}</Link>;
  }

  return <div className="flex min-w-[230px] flex-wrap items-center gap-2"><label className="sr-only" htmlFor={`crm-call-link-${idPrefix}-${callId}`}>{t("selectLead")}</label><select id={`crm-call-link-${idPrefix}-${callId}`} value={leadId} onChange={(event) => setLeadId(event.target.value)} className="min-h-9 max-w-48 rounded border border-border bg-background px-2 text-xs outline-none focus-visible:border-accent"><option value="">{t("selectLead")}</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.displayName}</option>)}</select><Button type="button" variant="outline" size="sm" disabled={!leadId || isPending} onClick={submit}>{t("link")}</Button>{message && <span className="text-xs font-bold text-state-healthy" role="status">{message}</span>}</div>;
}
