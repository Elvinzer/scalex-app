import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { computeCrmKpis, currentCrmPeriod } from "@/lib/crm/kpis";
import { getBusinessSalesOffers } from "@/lib/business/queries";
import { getCrmActions, getCrmKpiSources, getCrmSetters } from "@/lib/crm/queries";
import { crmLeadSourceSchema } from "@/lib/crm/schemas";
import { CRM_LEAD_SOURCES } from "@/lib/crm/types";

import { CrmActionList } from "./crm-action-list";
import { CrmExtensionSuggestion } from "./crm-extension-suggestion";

const KPI_KEYS = ["messages", "responses", "qualificationNotes", "conversations", "valueContent", "callsProposed", "callsBooked", "callsAttended", "noShows", "sales", "revenue"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function selectedPeriod(from: string | undefined, to: string | undefined) {
  if (!DATE_PATTERN.test(from ?? "") || !DATE_PATTERN.test(to ?? "")) return currentCrmPeriod();
  const periodFrom = new Date(`${from}T00:00:00.000Z`);
  const periodTo = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(periodFrom.getTime()) || Number.isNaN(periodTo.getTime()) || periodFrom > periodTo) return currentCrmPeriod();
  return { from: periodFrom, to: periodTo };
}

function dateValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function leadKpiHref(key: (typeof KPI_KEYS)[number], params: { setter?: string; platform?: string; offer?: string; source?: string }, period: { from: Date; to: Date }): string {
  const query = new URLSearchParams();
  const eventType = KPI_LEAD_EVENTS[key];
  if (eventType) {
    query.set("event", eventType);
    query.set("eventFrom", dateValue(period.from));
    query.set("eventTo", dateValue(period.to));
  }
  if (params.setter) query.set("responsible", params.setter);
  if (params.platform === "instagram" || params.platform === "linkedin") query.set("platform", params.platform);
  if (params.offer) query.set("offer", params.offer);
  if (params.source) query.set("source", params.source);
  return `/crm/leads?${query.toString()}`;
}

const KPI_LEAD_EVENTS: Partial<Record<(typeof KPI_KEYS)[number], string>> = {
  messages: "first_message_sent",
  responses: "response_received",
  qualificationNotes: "qualification_updated",
  conversations: "conversation_started",
  valueContent: "value_content_sent",
  callsProposed: "call_proposed",
  callsBooked: "call_booked",
  sales: "sale_validated",
  revenue: "sale_validated",
};

export default async function CrmTodayPage({ searchParams }: { searchParams: Promise<{ team?: string; from?: string; to?: string; setter?: string; platform?: string; offer?: string; source?: string }> }) {
  const t = await getTranslations("crm");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const params = await searchParams;
  const isTeamView = params.team === "1" && hasCrmPermission(access, "crm:view-team");
  const period = selectedPeriod(params.from, params.to);
  const defaultPeriod = currentCrmPeriod();
  const [setters, offers] = await Promise.all([getCrmSetters(access.accountId), getBusinessSalesOffers(access.accountId)]);
  const setterId = isTeamView && setters.some((setter) => setter.id === params.setter) ? params.setter : undefined;
  const platform = params.platform === "instagram" || params.platform === "linkedin" ? params.platform : undefined;
  const offerId = offers.some((offer) => offer.id === params.offer) ? params.offer : undefined;
  const source = crmLeadSourceSchema.safeParse(params.source).success ? crmLeadSourceSchema.parse(params.source) : undefined;
  const [{ events, calls, sales: linkedSales }, actions] = await Promise.all([
    getCrmKpiSources(access.accountId, period.from, period.to, { setterId, platform, offerId, source }),
    getCrmActions(access.accountId, { status: "open", responsibleUserId: isTeamView ? undefined : userId }),
  ]);
  const kpis = computeCrmKpis({ events, calls, sales: linkedSales, period });
  const activeFilterCount = [
    params.platform === "instagram" || params.platform === "linkedin",
    Boolean(offerId),
    Boolean(source),
    Boolean(setterId),
    period.from.getTime() !== defaultPeriod.from.getTime() || period.to.getTime() !== defaultPeriod.to.getTime(),
  ].filter(Boolean).length;
  const resetHref = isTeamView ? "/crm?team=1" : "/crm";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-2xl font-bold">{t("today.title")}</h2><p className="mt-1 text-muted-foreground">{t("today.subtitle")}</p></div>
        {hasCrmPermission(access, "crm:view-team") && <Button asChild variant="outline"><Link href={isTeamView ? "/crm" : "/crm?team=1"}>{isTeamView ? t("today.myView") : t("today.teamView")}</Link></Button>}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="crm-work-queue-title">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="crm-work-queue-title" className="text-xl font-bold">{t("today.queueTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("today.queueSubtitle")}</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/crm/actions?today=1">{t("today.openToday")}</Link></Button><Button asChild variant="outline"><Link href="/crm/leads">{t("today.openLeads")}</Link></Button></div></div>
        {actions.length > 0 ? <CrmActionList initialActions={actions} groupedByCategory groupByDueDate /> : <div className="sticker-card flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-muted-foreground">{t("today.emptyHelp")}</p><Button asChild variant="outline"><Link href="/crm/leads">{t("today.openLeads")}</Link></Button></div>}
      </section>

      <CrmExtensionSuggestion accountId={access.accountId} />

      <form method="get" className="sticker-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        {isTeamView && <input type="hidden" name="team" value="1" />}
        <label className="flex flex-col gap-1 text-sm font-bold lg:col-span-2">{t("kpis.from")}<input name="from" type="date" defaultValue={dateValue(period.from)} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
        <label className="flex flex-col gap-1 text-sm font-bold lg:col-span-2">{t("kpis.to")}<input name="to" type="date" defaultValue={dateValue(period.to)} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
        {isTeamView && <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.setter")}<select name="setter" defaultValue={setterId ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allSetters")}</option>{setters.map((setter) => <option key={setter.id} value={setter.id}>{setter.name}</option>)}</select></label>}
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.platform")}<select name="platform" defaultValue={platform ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allPlatforms")}</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option></select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.offer")}<select name="offer" defaultValue={offerId ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allOffers")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.source")}<select name="source" defaultValue={source ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allSources")}</option>{CRM_LEAD_SOURCES.map((item) => <option key={item} value={item}>{t(`sources.${item}`)}</option>)}</select></label>
        <Button type="submit" variant="outline" className="lg:col-span-1">{t("kpis.apply")}</Button>
      </form>
      {activeFilterCount > 0 && <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-muted-foreground"><span>{t("today.filtersApplied", { count: activeFilterCount })}</span><Link href={resetHref} className="inline-flex min-h-10 items-center underline underline-offset-4 hover:text-foreground">{t("kpis.reset")}</Link></div>}
      <p className="text-sm font-bold text-muted-foreground">{t("kpis.scope", { from: dateValue(period.from), to: dateValue(period.to), view: isTeamView ? t("kpis.team") : t("kpis.personal") })}</p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("kpis.period")}>
        {KPI_KEYS.map((key) => { const destination = key === "callsAttended" || key === "noShows" ? `/crm/appels?from=${dateValue(period.from)}&to=${dateValue(period.to)}${key === "noShows" ? "&attendance=no_show" : "&attendance=showed"}` : leadKpiHref(key, { setter: setterId, platform, offer: offerId, source }, period); return <Link key={key} href={destination} className="sticker-card p-4 transition hover:-translate-y-0.5"><p className="text-xs font-bold text-muted-foreground">{t(`kpis.${key}`)}</p><p className="mt-2 text-2xl font-bold">{key === "revenue" ? `${kpis[key]} €` : kpis[key]}</p></Link>; })}
      </section>
      {kpis.incomplete && <p className="rounded-[var(--radius-control)] bg-state-caution/10 px-4 py-3 text-sm font-bold text-state-caution">{t("kpis.incomplete")}</p>}
      <section className="sticker-card p-4" aria-labelledby="crm-kpi-rates-title"><h2 id="crm-kpi-rates-title" className="text-lg font-bold">{t("kpis.ratesTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("kpis.cohort", { count: kpis.cohortFirstMessages })}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["response", "qualification", "valueContent", "callProposed", "callBooked", "attendance", "noShow", "closing"] as const).map((key) => <div key={key} className="rounded-[var(--radius-control)] border border-border p-3"><p className="text-xs font-bold text-muted-foreground">{t(`kpis.rate${key[0].toUpperCase()}${key.slice(1)}`)}</p><p className="mt-1 text-lg font-bold">{kpis.rates[key] === null ? t("kpis.notMeasured") : `${Math.round(kpis.rates[key] * 100)}%`}</p></div>)}</div></section>

      <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/crm/pipeline">{t("today.openPipeline")}</Link></Button><Button asChild variant="outline"><Link href="/crm/leads">{t("tabs.leads")}</Link></Button></div>
    </div>
  );
}
