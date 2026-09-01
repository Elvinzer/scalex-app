import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { getCrmCalls, getCrmLeads, type CrmCallFilters } from "@/lib/crm/queries";
import { CRM_CALL_MATCH_STATUSES } from "@/lib/crm/types";

import { CrmCallLinkForm } from "../crm-call-link-form";
import { CrmCallMatchBatchControl } from "../crm-call-match-batch-control";
import { CrmCallMatchControls } from "../crm-call-match-controls";
import { CrmCallReference } from "../crm-call-reference";
import { CrmCallResultControl } from "../crm-call-result-control";

const CALL_SOURCES = ["iclosed", "calendly", "native", "manual"] as const;
const CALL_ATTENDANCES = ["booked", "showed", "no_show", "cancelled"] as const;
const CALL_OUTCOMES = ["pending", "closed", "not_closed", "awaiting_decision"] as const;

type CallsSearchParams = {
  q?: string | string[];
  source?: string | string[];
  unlinked?: string | string[];
  attendance?: string | string[];
  outcome?: string | string[];
  suggestion?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends readonly string[]>(values: T, value: string | undefined): T[number] | undefined {
  return value ? values.find((item): item is T[number] => item === value) : undefined;
}

function validDate(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function contactValues(call: { inviteeEmail: string | null; inviteePhone: string | null }): string[] {
  return [call.inviteeEmail, call.inviteePhone].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim());
}

function CallIdentity({ call, sourceLabel, t }: { call: Awaited<ReturnType<typeof getCrmCalls>>[number]; sourceLabel: string; t: (key: string, values?: Record<string, string | number>) => string }) {
  const contacts = contactValues(call);
  return (
    <div className="min-w-[250px]">
      <p className="font-bold">{call.inviteeName?.trim() || t("calls.unnamed")}</p>
      {contacts.length > 0 ? contacts.map((value) => <p key={value} className="max-w-64 truncate text-xs text-muted-foreground" title={value}>{value}</p>) : <p className="text-xs text-muted-foreground">{t("calls.noContact")}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{call.eventType?.trim() || t("calls.identity")}{call.durationMinutes ? ` · ${t("calls.durationMinutes", { minutes: call.durationMinutes })}` : ""}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>{sourceLabel}</span><span aria-hidden="true">·</span><span>{t("calls.reference")}</span></div>
      <CrmCallReference reference={call.externalReference} />
      <p className="mt-1 text-xs text-muted-foreground">{t("calls.responsible")}: {call.responsibleName ?? call.closer ?? t("detail.unassigned")}</p>
    </div>
  );
}

function attendanceKey(attendance: Awaited<ReturnType<typeof getCrmCalls>>[number]["attendance"]): "booked" | "showed" | "noShow" | "cancelled" {
  if (attendance === "showed") return "showed";
  if (attendance === "no_show") return "noShow";
  if (attendance === "cancelled") return "cancelled";
  return "booked";
}

function outcomeKey(outcome: Awaited<ReturnType<typeof getCrmCalls>>[number]["outcome"]): "closed" | "notClosed" | "awaitingDecision" | "pending" {
  if (outcome === "closed") return "closed";
  if (outcome === "not_closed") return "notClosed";
  if (outcome === "awaiting_decision") return "awaitingDecision";
  return "pending";
}

function suggestionLabelKey(status: (typeof CRM_CALL_MATCH_STATUSES)[number]): "pending" | "candidate" | "ambiguous" | "noMatch" | "unavailable" | "failed" | "expired" | "confirmed" | "rejected" | "dismissed" {
  if (status === "queued") return "pending";
  if (status === "ready") return "candidate";
  if (status === "no_match") return "noMatch";
  if (status === "accepted") return "confirmed";
  return status;
}

export default async function CrmCallsPage({ searchParams }: { searchParams: Promise<CallsSearchParams> }) {
  const t = await getTranslations("crm");
  const locale = await getLocale();
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;

  const params = await searchParams;
  const search = firstParam(params.q)?.trim().slice(0, 120) || undefined;
  const source = oneOf(CALL_SOURCES, firstParam(params.source));
  const attendance = oneOf(CALL_ATTENDANCES, firstParam(params.attendance));
  const outcome = oneOf(CALL_OUTCOMES, firstParam(params.outcome));
  const suggestionStatus = oneOf(CRM_CALL_MATCH_STATUSES, firstParam(params.suggestion));
  const from = validDate(firstParam(params.from));
  const to = validDate(firstParam(params.to));
  const filters: CrmCallFilters = { search, source, attendance, outcome, suggestionStatus, from, to, unlinkedOnly: firstParam(params.unlinked) === "1" };
  const [calls, leads] = await Promise.all([getCrmCalls(access.accountId, undefined, filters), getCrmLeads(access.accountId)]);
  const canLink = hasCrmPermission(access, "crm:assign");
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const sourceLabel = (value: string): string => {
    if (value === "iclosed" || value === "calendly" || value === "native" || value === "manual") return t(`sources.${value}`);
    return t("sources.unknown");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold">{t("calls.title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("calls.subtitle")}</p>
      </div>

      <form method="get" className="sticker-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <label className="flex flex-col gap-1 text-sm font-bold sm:col-span-2">{t("calls.search")}<input name="q" defaultValue={search ?? ""} placeholder={t("calls.search")} className="min-h-10 rounded border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent" /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.filters")}<select name="source" defaultValue={source ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.allSources")}</option>{CALL_SOURCES.map((value) => <option key={value} value={value}>{t(`sources.${value}`)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.unlinkedFilter")}<select name="unlinked" defaultValue={filters.unlinkedOnly ? "1" : ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.allCalls")}</option><option value="1">{t("calls.unlinkedFilter")}</option></select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.attendanceFilter")}<select name="attendance" defaultValue={attendance ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.attendanceFilter")}</option>{CALL_ATTENDANCES.map((value) => <option key={value} value={value}>{t(`calls.${attendanceKey(value)}`)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.outcomeFilter")}<select name="outcome" defaultValue={outcome ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.outcomeFilter")}</option>{CALL_OUTCOMES.map((value) => <option key={value} value={value}>{t(`calls.${outcomeKey(value)}`)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("calls.allSuggestionStates")}<select name="suggestion" defaultValue={suggestionStatus ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal"><option value="">{t("calls.allSuggestionStates")}</option>{CRM_CALL_MATCH_STATUSES.map((value) => <option key={value} value={value}>{t(`calls.match.${suggestionLabelKey(value)}`)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.from")}<input type="date" name="from" defaultValue={from ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.to")}<input type="date" name="to" defaultValue={to ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal" /></label>
        <div className="flex flex-wrap gap-2"><Button type="submit" variant="outline">{t("calls.applyFilters")}</Button><Button asChild type="button" variant="link"><a href="/crm/appels">{t("calls.resetFilters")}</a></Button></div>
      </form>

      {canLink && <CrmCallMatchBatchControl />}

      {calls.length === 0 ? <p className="sticker-card p-8 text-center text-muted-foreground">{t("calls.empty")}</p> : <>
        <div className="sticker-card hidden overflow-x-auto p-0 md:block">
          <table className="w-full min-w-[1220px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs font-bold text-muted-foreground"><th className="px-4 py-3">{t("calls.identity")}</th><th className="px-4 py-3">{t("leads.title")}</th><th className="px-4 py-3">{t("leads.source")}</th><th className="px-4 py-3">{t("calls.dateTime")}</th><th className="px-4 py-3">{t("calls.booked")}</th><th className="px-4 py-3">{t("calls.pending")}</th><th className="px-4 py-3">{t("calls.result")}</th><th className="px-4 py-3">{t("calls.match.label")}</th></tr></thead>
            <tbody>{calls.map((call) => <tr key={call.id} className="border-b border-border align-top last:border-0"><td className="px-4 py-3"><CallIdentity call={call} sourceLabel={sourceLabel(call.source)} t={t} /></td><td className="px-4 py-3 font-bold">{call.leadId ? <CrmCallLinkForm callId={call.id} initialLeadId={call.leadId} leads={leads} idPrefix="desktop-lead" /> : <span className="text-muted-foreground">{t("calls.unlinked")}</span>}</td><td className="px-4 py-3 text-muted-foreground">{sourceLabel(call.source)}</td><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateFormatter.format(new Date(call.scheduledAt))}</td><td className="px-4 py-3">{t(`calls.${attendanceKey(call.attendance)}`)}</td><td className="px-4 py-3">{t(`calls.${outcomeKey(call.outcome)}`)}</td><td className="px-4 py-3">{call.attendance === "cancelled" ? <span className="text-xs text-muted-foreground">{t("calls.cancelled")}</span> : <CrmCallResultControl call={call} idPrefix="desktop-result" />}</td><td className="px-4 py-3"><div className="flex min-w-[330px] flex-col gap-2"><CrmCallMatchControls call={call} canLink={canLink} idPrefix="desktop" />{!call.leadId && canLink && <CrmCallLinkForm callId={call.id} initialLeadId={null} leads={leads} idPrefix="desktop-link" />}{!call.leadId && !canLink && <span className="text-xs text-muted-foreground">{t("calls.linkRestricted")}</span>}</div></td></tr>)}</tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">{calls.map((call) => <article key={call.id} className="sticker-card flex flex-col gap-3 p-4"><div className="flex items-start justify-between gap-3"><CallIdentity call={call} sourceLabel={sourceLabel(call.source)} t={t} /><span className="shrink-0 text-xs font-bold text-muted-foreground">{t(`calls.${attendanceKey(call.attendance)}`)}</span></div><div className="grid grid-cols-2 gap-2 text-sm"><div><p className="text-xs text-muted-foreground">{t("calls.dateTime")}</p><p className="font-bold">{dateFormatter.format(new Date(call.scheduledAt))}</p></div><div><p className="text-xs text-muted-foreground">{t("calls.pending")}</p><p className="font-bold">{t(`calls.${outcomeKey(call.outcome)}`)}</p></div></div><div><p className="text-xs text-muted-foreground">{t("leads.title")}</p>{call.leadId ? <CrmCallLinkForm callId={call.id} initialLeadId={call.leadId} leads={leads} idPrefix="mobile-lead" /> : <p className="font-bold text-muted-foreground">{t("calls.unlinked")}</p>}</div>{call.attendance !== "cancelled" && <CrmCallResultControl call={call} idPrefix="mobile-result" />}<div><p className="mb-1 text-xs font-bold text-muted-foreground">{t("calls.match.label")}</p><CrmCallMatchControls call={call} canLink={canLink} idPrefix="mobile" />{!call.leadId && canLink && <div className="mt-2"><CrmCallLinkForm callId={call.id} initialLeadId={null} leads={leads} idPrefix="mobile-link" /></div>}{!call.leadId && !canLink && <p className="mt-2 text-xs text-muted-foreground">{t("calls.linkRestricted")}</p>}</div></article>)}</div>
      </>}
    </div>
  );
}
