import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { getActiveClosers } from "@/lib/closers/queries";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { getBusinessSalesOfferDetails } from "@/lib/business/queries";
import { CRM_EVENT_LABEL_KEYS, CRM_OUTCOME_LABEL_KEYS, CRM_STAGE_LABEL_KEYS } from "@/lib/crm/machine";
import { getCrmLeadsPage, getCrmSetters } from "@/lib/crm/queries";
import { CRM_LEADS_PAGE_SIZE } from "@/lib/crm/lead-pagination";
import { crmEventTypeSchema, crmLeadSourceSchema, crmOutcomeSchema, crmStageSchema } from "@/lib/crm/schemas";
import { CRM_CHANNELS, CRM_EVENT_TYPES, CRM_LEAD_OUTCOMES, CRM_LEAD_SOURCES, CRM_LEAD_STAGES } from "@/lib/crm/types";
import { withDatabaseReadTimeout } from "@/lib/perf/database-read";

import { CrmLeadManagementActions } from "../crm-lead-management-actions";
import { CrmLeadList } from "../crm-lead-list";

export default async function CrmLeadsPage({ searchParams }: { searchParams: Promise<{ search?: string; platform?: string; stage?: string; outcome?: string; responsible?: string; offer?: string; source?: string; from?: string; to?: string; event?: string; eventFrom?: string; eventTo?: string; overdue?: string; responded?: string; qualification?: string }> }) {
  const t = await getTranslations("crm");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const params = await searchParams;
  const [offers, setters, closers] = await withDatabaseReadTimeout(
    () => Promise.all([
      getBusinessSalesOfferDetails(access.accountId),
      getCrmSetters(access.accountId),
      getActiveClosers(access.accountId),
    ]),
    { operation: "crm-leads-metadata", timeoutMs: 15_000 },
  );
  const platform = CRM_CHANNELS.find((candidate) => candidate === params.platform);
  const stage = crmStageSchema.safeParse(params.stage).success ? crmStageSchema.parse(params.stage) : undefined;
  const outcome = crmOutcomeSchema.safeParse(params.outcome).success ? crmOutcomeSchema.parse(params.outcome) : undefined;
  const responsibleSetterId = setters.some((setter) => setter.id === params.responsible) ? params.responsible : undefined;
  const offerId = offers.some((offer) => offer.id === params.offer) ? params.offer : undefined;
  const source = crmLeadSourceSchema.safeParse(params.source).success ? crmLeadSourceSchema.parse(params.source) : undefined;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (value: string | undefined): string | undefined => {
    if (!value || !datePattern.test(value)) return undefined;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
  };
  const createdFrom = validDate(params.from);
  const createdTo = validDate(params.to);
  const eventType = crmEventTypeSchema.safeParse(params.event).success ? crmEventTypeSchema.parse(params.event) : undefined;
  const eventFrom = validDate(params.eventFrom);
  const eventTo = validDate(params.eventTo);
  const overdueActionOnly = params.overdue === "1";
  const respondedOnly = params.responded === "1";
  const qualificationOnly = params.qualification === "1";
  const search = params.search?.trim().slice(0, 200) || undefined;
  const filters = { search, platform, stage, outcome, responsibleSetterId, offerId, source, createdFrom, createdTo, eventType, eventFrom, eventTo, overdueActionOnly, respondedOnly, qualificationOnly };
  const { leads, totalCount } = await withDatabaseReadTimeout(
    () => getCrmLeadsPage(access.accountId, filters, { limit: CRM_LEADS_PAGE_SIZE, offset: 0 }),
    { operation: "crm-leads-data", timeoutMs: 15_000 },
  );
  const leadListKey = `${JSON.stringify(filters)}:${totalCount}:${leads.map(({ id, updatedAt }) => `${id}:${updatedAt}`).join("|")}`;
  const advancedFilterCount = [outcome, responsibleSetterId, offerId, source, createdFrom, createdTo, overdueActionOnly, respondedOnly, qualificationOnly, eventType, eventFrom, eventTo].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{t("leads.title")}</h1><p className="mt-1 text-muted-foreground">{t("leads.subtitle")}</p></div><CrmLeadManagementActions offers={offers} setters={setters} canImport={hasCrmPermission(access, "crm:manage-pipeline")} /></div>
      <form method="get" className="sticker-card grid gap-3 p-4 lg:grid-cols-4 lg:items-end">
        <label className="flex flex-col gap-1 text-sm font-bold lg:col-span-4">{t("leads.search")}<input name="search" maxLength={200} defaultValue={search} className="min-h-11 rounded border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent" /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.channel")}<select name="platform" defaultValue={platform ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allChannels")}</option>{CRM_CHANNELS.map((channel) => <option key={channel} value={channel}>{t(`leads.sourceOptions.${channel}`)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allStages")}<select name="stage" defaultValue={stage ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allStages")}</option>{CRM_LEAD_STAGES.map((item) => <option key={item} value={item}>{t(CRM_STAGE_LABEL_KEYS[item])}</option>)}</select></label>
        <details className="group lg:col-span-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-accent/20 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><span>{t("leads.advancedFilters")}</span>{advancedFilterCount > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{advancedFilterCount}</span>}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allOutcomes")}<select name="outcome" defaultValue={outcome ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allOutcomes")}</option>{CRM_LEAD_OUTCOMES.map((item) => <option key={item} value={item}>{t(CRM_OUTCOME_LABEL_KEYS[item])}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allResponsibles")}<select name="responsible" defaultValue={responsibleSetterId ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allResponsibles")}</option>{setters.map((setter) => <option key={setter.id} value={setter.id}>{setter.name}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allOffers")}<select name="offer" defaultValue={offerId ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allOffers")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allSources")}<select name="source" defaultValue={source ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allSources")}</option>{CRM_LEAD_SOURCES.map((item) => <option key={item} value={item}>{t(`leads.sourceOptions.${item}`)}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.from")}<input name="from" type="date" defaultValue={createdFrom} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.to")}<input name="to" type="date" defaultValue={createdTo} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.eventType")}<select name="event" defaultValue={eventType ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allEvents")}</option>{CRM_EVENT_TYPES.map((item) => <option key={item} value={item}>{t(CRM_EVENT_LABEL_KEYS[item])}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.eventFrom")}<input name="eventFrom" type="date" defaultValue={eventFrom} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
            <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.eventTo")}<input name="eventTo" type="date" defaultValue={eventTo} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input name="overdue" value="1" type="checkbox" defaultChecked={overdueActionOnly} className="size-5 accent-accent" />{t("leads.overdueAction")}</label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input name="responded" value="1" type="checkbox" defaultChecked={respondedOnly} className="size-5 accent-accent" />{t("leads.respondedOnly")}</label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input name="qualification" value="1" type="checkbox" defaultChecked={qualificationOnly} className="size-5 accent-accent" />{t("leads.qualificationOnly")}</label>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-3 lg:col-span-4"><Button type="submit" variant="outline" className="min-h-11">{t("leads.apply")}</Button><Link href="/crm/leads" className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4 hover:text-foreground">{t("leads.reset")}</Link><span className="text-sm text-muted-foreground" aria-live="polite">{t("leads.resultCount", { count: totalCount })}</span></div>
      </form>
      {leads.length === 0 ? <><p className="text-sm text-muted-foreground" aria-live="polite">{t("leads.pagination.showing", { displayed: 0, total: totalCount })}</p><p className="sticker-card p-8 text-center text-muted-foreground">{t("leads.empty")}</p></> : <><p className="text-sm text-muted-foreground">{t("leads.rowHint")}</p><CrmLeadList key={leadListKey} leads={leads} totalCount={totalCount} filters={filters} setters={setters} offers={offers} closers={closers} canAssign={hasCrmPermission(access, "crm:assign")} canManagePipeline={hasCrmPermission(access, "crm:manage-pipeline")} canValidateSale={hasCrmPermission(access, "crm:validate-sale")} /></>}
    </div>
  );
}
