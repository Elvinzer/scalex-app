import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { computeCrmKpis, currentCrmPeriod } from "@/lib/crm/kpis";
import { getBusinessProfile } from "@/lib/business/queries";
import { getCrmActions, getCrmKpiSources, getCrmSetters } from "@/lib/crm/queries";
import { crmLeadSourceSchema } from "@/lib/crm/schemas";
import { CRM_LEAD_SOURCES } from "@/lib/crm/types";

import { CrmActionList } from "./crm-action-list";

const KPI_KEYS = ["messages", "responses", "conversations", "valueContent", "callsProposed", "callsBooked", "callsAttended", "noShows", "sales"] as const;
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

export default async function CrmTodayPage({ searchParams }: { searchParams: Promise<{ team?: string; from?: string; to?: string; setter?: string; platform?: string; offer?: string; source?: string }> }) {
  const t = await getTranslations("crm");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const params = await searchParams;
  const isTeamView = params.team === "1" && hasCrmPermission(access, "crm:view-team");
  const period = selectedPeriod(params.from, params.to);
  const [setters, businessProfile] = await Promise.all([getCrmSetters(access.accountId), getBusinessProfile(access.accountId)]);
  const setterId = isTeamView && setters.some((setter) => setter.id === params.setter) ? params.setter : undefined;
  const platform = params.platform === "instagram" || params.platform === "linkedin" ? params.platform : undefined;
  const offerId = businessProfile.sales.offers.some((offer) => offer.id === params.offer) ? params.offer : undefined;
  const source = crmLeadSourceSchema.safeParse(params.source).success ? crmLeadSourceSchema.parse(params.source) : undefined;
  const [{ events, calls, sales: linkedSales }, actions] = await Promise.all([
    getCrmKpiSources(access.accountId, period.from, period.to, { setterId, platform, offerId, source }),
    getCrmActions(access.accountId, { status: "open", responsibleUserId: isTeamView ? undefined : userId }),
  ]);
  const kpis = computeCrmKpis({ events, calls, sales: linkedSales, period });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-2xl font-bold">{t("today.title")}</h2><p className="mt-1 text-muted-foreground">{t("today.subtitle")}</p></div>
        {hasCrmPermission(access, "crm:view-team") && <Button asChild variant="outline"><Link href={isTeamView ? "/crm" : "/crm?team=1"}>{isTeamView ? t("today.myView") : t("today.teamView")}</Link></Button>}
      </div>

      <form method="get" className="sticker-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        {isTeamView && <input type="hidden" name="team" value="1" />}
        <label className="flex flex-col gap-1 text-sm font-bold lg:col-span-2">{t("kpis.from")}<input name="from" type="date" defaultValue={dateValue(period.from)} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
        <label className="flex flex-col gap-1 text-sm font-bold lg:col-span-2">{t("kpis.to")}<input name="to" type="date" defaultValue={dateValue(period.to)} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
        {isTeamView && <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.setter")}<select name="setter" defaultValue={setterId ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allSetters")}</option>{setters.map((setter) => <option key={setter.id} value={setter.id}>{setter.name}</option>)}</select></label>}
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.platform")}<select name="platform" defaultValue={platform ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allPlatforms")}</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option></select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.offer")}<select name="offer" defaultValue={offerId ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allOffers")}</option>{businessProfile.sales.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("kpis.source")}<select name="source" defaultValue={source ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("kpis.allSources")}</option>{CRM_LEAD_SOURCES.map((item) => <option key={item} value={item}>{t(`sources.${item}`)}</option>)}</select></label>
        <Button type="submit" variant="outline" className="lg:col-span-1">{t("kpis.apply")}</Button>
      </form>
      <p className="text-sm font-bold text-muted-foreground">{t("kpis.scope", { from: dateValue(period.from), to: dateValue(period.to), view: isTeamView ? t("kpis.team") : t("kpis.personal") })}</p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("kpis.period")}>
        {KPI_KEYS.map((key) => <Link key={key} href={`/crm/leads?from=${dateValue(period.from)}&to=${dateValue(period.to)}`} className="sticker-card p-4 transition hover:-translate-y-0.5"><p className="text-xs font-bold text-muted-foreground">{t(`kpis.${key}`)}</p><p className="mt-2 text-2xl font-bold">{kpis[key]}</p></Link>)}
      </section>
      {kpis.incomplete && <p className="rounded-[var(--radius-control)] bg-state-warning/10 px-4 py-3 text-sm font-bold text-state-warning">{t("kpis.incomplete")}</p>}
      <section className="sticker-card p-4" aria-labelledby="crm-kpi-rates-title"><h2 id="crm-kpi-rates-title" className="text-lg font-bold">{t("kpis.ratesTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("kpis.cohort", { count: kpis.cohortFirstMessages })}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["response", "valueContent", "callProposed", "callBooked", "attendance", "noShow", "closing"] as const).map((key) => <div key={key} className="rounded-[var(--radius-control)] border border-border p-3"><p className="text-xs font-bold text-muted-foreground">{t(`kpis.rate${key[0].toUpperCase()}${key.slice(1)}`)}</p><p className="mt-1 text-lg font-bold">{kpis.rates[key] === null ? "—" : `${Math.round(kpis.rates[key] * 100)}%`}</p></div>)}</div></section>

      <section className="flex flex-col gap-3" aria-labelledby="crm-today-actions-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="crm-today-actions-title" className="text-xl font-bold">{t("today.actionsTitle")}</h2><Button asChild variant="outline"><Link href="/crm/actions">{t("today.openActions")}</Link></Button></div>
        <CrmActionList initialActions={actions} groupedByCategory groupByDueDate />
      </section>
      <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/crm/pipeline">{t("today.openPipeline")}</Link></Button><Button asChild variant="outline"><Link href="/crm/leads">{t("tabs.leads")}</Link></Button></div>
    </div>
  );
}
