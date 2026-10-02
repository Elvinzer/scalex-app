import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { computeCrmKpis, CRM_PRIMARY_KPI_METRICS, type CrmPrimaryKpiMetric } from "@/lib/crm/kpis";
import { getBusinessSalesOffers } from "@/lib/business/queries";
import { getCrmActions, getCrmKpiSources, getCrmSetters } from "@/lib/crm/queries";
import { getCrmExtensionRelease } from "@/lib/crm/extension-release";
import { crmPeriodDateValue, resolveCrmPeriod } from "@/lib/crm/period";
import { crmLeadSourceSchema, crmTimeZoneSchema } from "@/lib/crm/schemas";
import { CRM_CHANNELS, CRM_LEAD_SOURCES } from "@/lib/crm/types";

import { CrmActionList } from "./crm-action-list";
import { CrmExtensionSuggestion } from "./crm-extension-suggestion";
import { CrmPeriodFilter } from "./crm-period-filter";
import { CrmTimeZoneSync } from "./crm-time-zone-sync";

const SECONDARY_KPI_KEYS = ["responses", "qualificationNotes", "callsProposed", "callsBooked", "callsAttended", "noShows", "sales", "revenue"] as const;

function leadKpiHref(key: CrmPrimaryKpiMetric, params: { setter?: string; platform?: string; offer?: string; source?: string }, period: { from: Date; to: Date }): string {
  const query = new URLSearchParams();
  query.set("metric", key);
  query.set("firstMessageFrom", crmPeriodDateValue(period.from));
  query.set("firstMessageTo", crmPeriodDateValue(period.to));
  if (params.setter) query.set("responsible", params.setter);
  if (params.platform) query.set("platform", params.platform);
  if (params.offer) query.set("offer", params.offer);
  if (params.source) query.set("source", params.source);
  return `/crm/leads?${query.toString()}`;
}

export default async function CrmTodayPage({ searchParams }: { searchParams: Promise<{ team?: string; range?: string; from?: string; to?: string; setter?: string; platform?: string; offer?: string; source?: string; tz?: string }> }) {
  const t = await getTranslations("crm");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const extensionRelease = getCrmExtensionRelease();
  const extensionInstallLabel = extensionRelease.distribution === "web_store"
    ? t("extension.onboarding.installAction")
    : extensionRelease.distribution === "pilot_package"
      ? t("extension.onboarding.downloadPilot")
      : null;
  const params = await searchParams;
  const timeZoneResult = crmTimeZoneSchema.safeParse(params.tz);
  const timeZone = timeZoneResult.success ? timeZoneResult.data : "UTC";
  const isTeamView = params.team === "1" && hasCrmPermission(access, "crm:view-team");
  const period = resolveCrmPeriod(params.range, params.from, params.to);
  const defaultPeriod = resolveCrmPeriod("current-month", undefined, undefined);
  const [setters, offers] = await Promise.all([getCrmSetters(access.accountId), getBusinessSalesOffers(access.accountId)]);
  const setterId = isTeamView && setters.some((setter) => setter.id === params.setter) ? params.setter : undefined;
  const platform = CRM_CHANNELS.find((candidate) => candidate === params.platform);
  const offerId = offers.some((offer) => offer.id === params.offer) ? params.offer : undefined;
  const source = crmLeadSourceSchema.safeParse(params.source).success ? crmLeadSourceSchema.parse(params.source) : undefined;
  const asOf = new Date();
  const [{ events, stageChanges, calls, sales: linkedSales }, actions] = await Promise.all([
    getCrmKpiSources(access.accountId, period.from, period.to, { setterId, platform, offerId, source }, asOf),
    getCrmActions(access.accountId, { status: "open", responsibleUserId: isTeamView ? undefined : userId }),
  ]);
  const kpis = computeCrmKpis({ events, stageChanges, calls, sales: linkedSales, period, asOf });
  const activeFilterCount = [
    params.platform === "instagram" || params.platform === "linkedin",
    Boolean(offerId),
    Boolean(source),
    Boolean(setterId),
    period.from.getTime() !== defaultPeriod.from.getTime() || period.to.getTime() !== defaultPeriod.to.getTime(),
  ].filter(Boolean).length;
  const resetQuery = new URLSearchParams();
  if (isTeamView) resetQuery.set("team", "1");
  if (timeZoneResult.success) resetQuery.set("tz", timeZone);
  const resetQueryString = resetQuery.toString();
  const resetHref = resetQueryString ? `/crm?${resetQueryString}` : "/crm";
  const actionListKey = `${isTeamView}:${timeZone}:${actions.map((action) => `${action.id}:${action.dueAt}:${action.status}`).join(",")}`;

  return (
    <div className="flex flex-col gap-6">
      <CrmTimeZoneSync timeZone={timeZone} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">{t("tabs.today")}</h1><p className="mt-1 hidden text-muted-foreground sm:block">{t("today.subtitle")}</p></div>
        {hasCrmPermission(access, "crm:view-team") && <Button asChild variant="outline" className="hidden min-h-11 sm:inline-flex"><Link href={isTeamView ? "/crm" : "/crm?team=1"}>{isTeamView ? t("today.myView") : t("today.teamView")}</Link></Button>}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="crm-work-queue-title">
        <h2 id="crm-work-queue-title" className="sr-only">{t("today.queueTitle")}</h2>
        {actions.length > 0 ? <CrmActionList key={actionListKey} initialActions={actions} returnTo={resetHref} timeZone={timeZone} groupByDueDate featureFirstAction featuredActionLabel={t("leads.nextAction")} /> : <div className="sticker-card flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-muted-foreground">{t("today.emptyHelp")}</p><Button asChild variant="outline" className="min-h-11"><Link href="/crm/leads">{t("today.openLeads")}</Link></Button></div>}
      </section>

      {hasCrmPermission(access, "crm:view-team") && <div className="sm:hidden"><Button asChild variant="outline" className="min-h-11"><Link href={isTeamView ? "/crm" : "/crm?team=1"}>{isTeamView ? t("today.myView") : t("today.teamView")}</Link></Button></div>}

      <CrmExtensionSuggestion
        accountId={access.accountId}
        installUrl={extensionRelease.updateUrl}
        installLabel={extensionInstallLabel}
      />

      <details className="sticker-card group overflow-hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-accent/20 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0"><span className="block text-sm font-bold">{t("kpis.analyticsTitle")}</span><span className="mt-0.5 block text-sm text-muted-foreground">{t("kpis.analyticsSubtitle")}</span></span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="flex flex-col gap-5 border-t border-border p-4">
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        {isTeamView && <input type="hidden" name="team" value="1" />}
        <div className="flex min-w-0 flex-col gap-2 sm:col-span-2 lg:col-span-6">
          <span className="text-sm font-bold">{t("kpis.period")}</span>
          <CrmPeriodFilter activePreset={period.preset} from={crmPeriodDateValue(period.from)} to={crmPeriodDateValue(period.to)} />
          <input type="hidden" name="range" value={period.preset} />
          {period.preset === "custom" && <><input type="hidden" name="from" value={crmPeriodDateValue(period.from)} /><input type="hidden" name="to" value={crmPeriodDateValue(period.to)} /></>}
        </div>
        {isTeamView && <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.setter")}<select name="setter" defaultValue={setterId ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allSetters")}</option>{setters.map((setter) => <option key={setter.id} value={setter.id}>{setter.name}</option>)}</select></label>}
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.channel")}<select name="platform" defaultValue={platform ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allChannels")}</option>{CRM_CHANNELS.map((channel) => <option key={channel} value={channel}>{t(`sources.${channel}`)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.offer")}<select name="offer" defaultValue={offerId ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allOffers")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.source")}<select name="source" defaultValue={source ?? ""} className="min-h-11 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allSources")}</option>{CRM_LEAD_SOURCES.map((item) => <option key={item} value={item}>{t(`sources.${item}`)}</option>)}</select></label>
        <Button type="submit" variant="outline" className="min-h-11 lg:col-span-1">{t("kpis.apply")}</Button>
      </form>
      {activeFilterCount > 0 && <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-muted-foreground"><span>{t("today.filtersApplied", { count: activeFilterCount })}</span><Link href={resetHref} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground">{t("kpis.reset")}</Link></div>}
      <p className="text-sm font-bold text-muted-foreground">{t("kpis.scope", { from: crmPeriodDateValue(period.from), to: crmPeriodDateValue(period.to), view: isTeamView ? t("kpis.team") : t("kpis.personal") })}</p>

      <section className="grid gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3" aria-label={t("kpis.primaryTitle")}>
        {CRM_PRIMARY_KPI_METRICS.map((key) => {
          const value = key === "messages" || key === "conversations" || key === "valueContent"
            ? kpis[key]
            : kpis.rates[key === "responses" ? "response" : key === "callsProposed" ? "callProposed" : "callBooked"];
          const displayValue = typeof value === "number" ? `${Math.round(value * (key === "messages" || key === "conversations" || key === "valueContent" ? 1 : 100))}${key === "messages" || key === "conversations" || key === "valueContent" ? "" : "%"}` : t("kpis.notMeasured");
          const destination = leadKpiHref(key, { setter: setterId, platform, offer: offerId, source }, period);
          return <Link key={key} href={destination} className="sticker-card p-4 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/30"><p className="text-xs font-bold text-muted-foreground">{t(`kpis.primary.${key}`)}</p><p className="mt-2 text-2xl font-bold">{displayValue}</p></Link>;
        })}
      </section>
      <p className="text-sm text-muted-foreground">{t("kpis.rateBasis")}</p>
      {kpis.incomplete && <p className="rounded-[var(--radius-control)] bg-state-caution/10 px-4 py-3 text-sm font-bold text-state-caution">{t("kpis.incomplete")}</p>}
      <details className="rounded-[var(--radius-control)] border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("kpis.secondaryTitle")}</summary>
        <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
          {SECONDARY_KPI_KEYS.map((key) => {
            const destination = key === "callsAttended" || key === "noShows"
              ? `/crm/appels?from=${crmPeriodDateValue(period.from)}&to=${crmPeriodDateValue(period.to)}${key === "noShows" ? "&attendance=no_show" : "&attendance=showed"}`
              : null;
            return <div key={key} className="rounded-[var(--radius-control)] border border-border p-3"><p className="text-xs font-bold text-muted-foreground">{t(`kpis.${key}`)}</p><p className="mt-1 text-lg font-bold">{key === "revenue" ? `${kpis[key]} €` : kpis[key]}</p>{destination && <Link href={destination} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4">{t("kpis.viewCalls")}</Link>}</div>;
          })}
          <section className="sm:col-span-2 lg:col-span-4"><h2 className="text-sm font-bold">{t("kpis.ratesTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("kpis.cohort", { count: kpis.cohortFirstMessages })}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["qualification", "valueContent", "attendance", "noShow", "closing"] as const).map((key) => <div key={key} className="rounded-[var(--radius-control)] border border-border p-3"><p className="text-xs font-bold text-muted-foreground">{t(`kpis.rate${key[0].toUpperCase()}${key.slice(1)}`)}</p><p className="mt-1 text-lg font-bold">{kpis.rates[key] === null ? t("kpis.notMeasured") : `${Math.round(kpis.rates[key] * 100)}%`}</p></div>)}</div></section>
        </div>
      </details>
        </div>
      </details>

      <div className="flex flex-wrap gap-3"><Button asChild variant="outline" className="min-h-11"><Link href="/crm/pipeline">{t("today.openPipeline")}</Link></Button><Button asChild variant="outline" className="min-h-11"><Link href="/crm/leads">{t("tabs.leads")}</Link></Button></div>
    </div>
  );
}
