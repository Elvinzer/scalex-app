"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { CrmCallMatchStatus, CrmCallView } from "@/lib/crm/types";

import { confirmCrmCallMatchAction, decideCrmCallMatchAction, requestCrmCallMatchAction } from "./crm-actions";

function statusTranslationKey(status: CrmCallMatchStatus): "pending" | "candidate" | "ambiguous" | "noMatch" | "unavailable" | "failed" | "expired" | "label" {
  switch (status) {
    case "queued": return "pending";
    case "ready": return "candidate";
    case "ambiguous": return "ambiguous";
    case "no_match": return "noMatch";
    case "unavailable": return "unavailable";
    case "failed": return "failed";
    case "expired": return "expired";
    default: return "label";
  }
}

function isRetryable(status: CrmCallMatchStatus): boolean {
  return status === "failed" || status === "unavailable" || status === "expired" || status === "no_match";
}

export function CrmCallMatchControls({ call, canLink, idPrefix = "call" }: { call: CrmCallView; canLink: boolean; idPrefix?: string }) {
  const t = useTranslations("crm.calls");
  const locale = useLocale();
  const router = useRouter();
  const [localStatus, setLocalStatus] = useState<CrmCallMatchStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const suggestion = call.suggestion;
  const status = localStatus ?? suggestion?.status ?? null;

  if (call.leadId) return <p className="text-xs font-bold text-state-healthy">{t("linked")}</p>;

  function request(force: boolean): void {
    setMessage(null);
    setLocalStatus("queued");
    startTransition(async () => {
      const result = await requestCrmCallMatchAction({ callId: call.id, force });
      if (result.error) {
        setMessage(result.error);
        setLocalStatus(null);
        return;
      }
      setLocalStatus(result.status ?? "queued");
      router.refresh();
    });
  }

  function confirm(leadId: string): void {
    if (!suggestion || !canLink) return;
    setMessage(null);
    startTransition(async () => {
      const result = await confirmCrmCallMatchAction({ callId: call.id, suggestionId: suggestion.id, leadId });
      setMessage(result.error ?? t("match.confirmed"));
      if (!result.error) router.refresh();
    });
  }

  function decide(decision: "rejected" | "dismissed"): void {
    if (!suggestion || !canLink) return;
    setMessage(null);
    startTransition(async () => {
      const result = await decideCrmCallMatchAction({ suggestionId: suggestion.id, decision });
      setMessage(result.error ?? t(`match.${decision}`));
      if (!result.error) router.refresh();
    });
  }

  if (isPending || status === "queued") {
    return <p className="text-xs font-bold text-muted-foreground" role="status">{t("match.pending")}</p>;
  }

  if (!suggestion || !status) {
    return <div className="flex flex-col items-start gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={() => request(false)} disabled={isPending} data-testid={`${idPrefix}-match-request-${call.id}`}>{t("match.suggest")}</Button>
      {message && <p className="text-xs font-bold text-state-negative" role="status">{message}</p>}
    </div>;
  }

  if (status === "ready" || status === "ambiguous") {
    const candidates = suggestion.candidates.slice(0, 3);
    return (
      <div className="flex min-w-[280px] flex-col gap-2 rounded-[var(--radius-card)] border border-accent-2/25 bg-accent-2/5 p-3" data-testid={`${idPrefix}-match-suggestion`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-accent-2-text">{t("match.falco")}</p>
          <span className="text-xs font-bold text-muted-foreground">{t(`match.${suggestion.confidence ?? "low"}`)}</span>
        </div>
        <p className="text-xs font-bold">{t(`match.${statusTranslationKey(status)}`)}</p>
        {candidates.length === 0 ? <p className="text-xs text-muted-foreground">{t("match.noMatch")}</p> : <div className="flex flex-col gap-2">
          {candidates.map((candidate, index) => <div key={candidate.id} className="rounded border border-border bg-card p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/crm/leads/${candidate.leadId}`} className="font-bold underline-offset-2 hover:underline">{candidate.leadName}</Link>
                {candidate.leadHandle && <p className="truncate text-xs text-muted-foreground">@{candidate.leadHandle}</p>}
              </div>
              <span className="shrink-0 text-xs font-bold text-muted-foreground">{t(`match.${candidate.confidence}`)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {candidate.reasonCodes.slice(0, 4).map((code) => <span key={code} className="rounded-full bg-muted px-1.5 py-0.5 text-[0.68rem] text-muted-foreground">{t(`match.reasonCodes.${code}`)}</span>)}
            </div>
            {candidate.reasons.length > 0 && <ul className="mt-1 list-disc pl-4 text-[0.68rem] text-muted-foreground">{candidate.reasons.slice(0, 3).map((reason) => <li key={`${candidate.id}-${reason.code}`}>{reason.label}</li>)}</ul>}
            {candidate.missingEvidence.length > 0 && <p className="mt-1 text-[0.68rem] text-muted-foreground">{t("match.missing")}: {candidate.missingEvidence.slice(0, 2).join(", ")}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {canLink ? <Button type="button" variant="outline" size="xs" onClick={() => confirm(candidate.leadId)} disabled={isPending}>{index === 0 ? t("match.confirm") : t("match.alternative")}</Button> : <span className="text-[0.68rem] font-bold text-muted-foreground">{t("linkRestricted")}</span>}
              <Button asChild type="button" variant="link" size="xs"><Link href={`/crm/leads/${candidate.leadId}`}>{t("match.viewLead")}</Link></Button>
            </div>
          </div>)}
        </div>}
        {canLink && <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="xs" onClick={() => decide("rejected")} disabled={isPending}>{t("match.reject")}</Button>
          <Button type="button" variant="link" size="xs" onClick={() => decide("dismissed")} disabled={isPending}>{t("match.dismiss")}</Button>
        </div>}
        {suggestion.generatedAt && <p className="text-[0.68rem] text-muted-foreground">{t("match.generatedAt", { at: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(suggestion.generatedAt)) })}</p>}
        {message && <p className="text-xs font-bold text-muted-foreground" role="status">{message}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-w-[190px] flex-col items-start gap-1.5">
      <p className="text-xs font-bold text-muted-foreground">{t(`match.${statusTranslationKey(status)}`)}</p>
      {suggestion.failureCode && <p className="text-xs text-muted-foreground">{t("match.retry")}</p>}
      {(isRetryable(status) || status === "accepted" || status === "rejected" || status === "dismissed") && <Button type="button" variant="outline" size="xs" onClick={() => request(true)} disabled={isPending}>{t("match.retry")}</Button>}
      {suggestion.generatedAt && <p className="text-[0.68rem] text-muted-foreground">{t("match.generatedAt", { at: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(suggestion.generatedAt)) })}</p>}
      {message && <p className="text-xs font-bold text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}
