"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { CrmCallView } from "@/lib/crm/types";

import { setCrmCallResultAction } from "./crm-actions";

type CallResult = "pending" | "showed" | "no_show" | "awaiting_decision" | "not_closed";

function initialResult(call: CrmCallView): CallResult {
  if (call.attendance === "no_show") return "no_show";
  if (call.outcome === "awaiting_decision") return "awaiting_decision";
  if (call.outcome === "not_closed") return "not_closed";
  if (call.attendance === "booked" && call.outcome === "pending") return "pending";
  return "showed";
}

function isCallResult(value: string): value is Exclude<CallResult, "pending"> {
  return value === "showed" || value === "no_show" || value === "awaiting_decision" || value === "not_closed";
}

export function CrmCallResultControl({ call, idPrefix = "desktop" }: { call: CrmCallView; idPrefix?: string }) {
  const t = useTranslations("crm.calls");
  const [result, setResult] = useState<CallResult>(initialResult(call));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: CallResult) {
    if (next === "pending") return;
    setResult(next);
    setMessage(null);
    startTransition(async () => {
      const response = await setCrmCallResultAction({ callId: call.id, result: next });
      setMessage(response.error ?? t("updated"));
    });
  }

  return (
    <div className="flex min-w-40 flex-col gap-1.5">
      <label className="sr-only" htmlFor={`crm-call-result-${idPrefix}-${call.id}`}>{t("result")}</label>
      <select id={`crm-call-result-${idPrefix}-${call.id}`} value={result} disabled={isPending} onChange={(event) => { const next = event.currentTarget.value; if (next === "pending" || isCallResult(next)) save(next); }} className="min-h-9 rounded border border-border bg-background px-2 text-sm outline-none focus-visible:border-accent">
        <option value="pending">{t("pending")}</option>
        <option value="showed">{t("showed")}</option>
        <option value="no_show">{t("noShow")}</option>
        <option value="awaiting_decision">{t("awaitingDecision")}</option>
        <option value="not_closed">{t("notClosed")}</option>
      </select>
      {call.leadId && <Button type="button" asChild variant="outline" size="sm"><a href={`/crm/leads/${call.leadId}`}>{t("openLead")}</a></Button>}
      {message && <span className="text-xs text-muted-foreground" role="status">{message}</span>}
    </div>
  );
}
