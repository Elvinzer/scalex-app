import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { getActiveClosers } from "@/lib/closers/queries";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { getBusinessProfile } from "@/lib/business/queries";
import { CRM_OUTCOME_LABEL_KEYS, CRM_STAGE_LABEL_KEYS } from "@/lib/crm/machine";
import { getCrmLeads, getCrmSetters } from "@/lib/crm/queries";
import { crmOutcomeSchema, crmStageSchema } from "@/lib/crm/schemas";
import { CRM_LEAD_OUTCOMES, CRM_LEAD_STAGES } from "@/lib/crm/types";

import { CrmLeadCaptureForm } from "../crm-lead-capture-form";
import { CrmLeadList } from "../crm-lead-list";

const SOURCE_OPTIONS = ["instagram", "tiktok", "youtube", "linkedin", "x", "facebook", "ads", "email_newsletter", "bouche_a_oreille", "autre"] as const;

export default async function CrmLeadsPage({ searchParams }: { searchParams: Promise<{ search?: string; platform?: string; stage?: string; outcome?: string; responsible?: string; offer?: string; source?: string; from?: string; to?: string; overdue?: string }> }) {
  const t = await getTranslations("crm");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const params = await searchParams;
  const [businessProfile, setters, closers] = await Promise.all([getBusinessProfile(access.accountId), getCrmSetters(access.accountId), getActiveClosers(access.accountId)]);
  const platform = params.platform === "instagram" || params.platform === "linkedin" ? params.platform : undefined;
  const stage = crmStageSchema.safeParse(params.stage).success ? crmStageSchema.parse(params.stage) : undefined;
  const outcome = crmOutcomeSchema.safeParse(params.outcome).success ? crmOutcomeSchema.parse(params.outcome) : undefined;
  const responsibleSetterId = setters.some((setter) => setter.id === params.responsible) ? params.responsible : undefined;
  const offerId = businessProfile.sales.offers.some((offer) => offer.id === params.offer) ? params.offer : undefined;
  const source = SOURCE_OPTIONS.includes(params.source as typeof SOURCE_OPTIONS[number]) ? params.source : undefined;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const createdFrom = datePattern.test(params.from ?? "") ? params.from : undefined;
  const createdTo = datePattern.test(params.to ?? "") ? params.to : undefined;
  const leads = await getCrmLeads(access.accountId, { search: params.search, platform, stage, outcome, responsibleSetterId, offerId, source, createdFrom, createdTo, overdueActionOnly: params.overdue === "1" });

  return (
    <div className="flex flex-col gap-6">
      <div><h2 className="text-2xl font-bold">{t("leads.title")}</h2><p className="mt-1 text-muted-foreground">{t("leads.subtitle")}</p></div>
      <CrmLeadCaptureForm offers={businessProfile.sales.offers} setters={setters} />
      <form method="get" className="sticker-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.search")}<input name="search" defaultValue={params.search} className="min-h-10 rounded border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent" /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.platform")}<select name="platform" defaultValue={platform ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allPlatforms")}</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option></select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allStages")}<select name="stage" defaultValue={stage ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allStages")}</option>{CRM_LEAD_STAGES.map((item) => <option key={item} value={item}>{t(CRM_STAGE_LABEL_KEYS[item])}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allOutcomes")}<select name="outcome" defaultValue={outcome ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allOutcomes")}</option>{CRM_LEAD_OUTCOMES.map((item) => <option key={item} value={item}>{t(CRM_OUTCOME_LABEL_KEYS[item])}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allResponsibles")}<select name="responsible" defaultValue={responsibleSetterId ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allResponsibles")}</option>{setters.map((setter) => <option key={setter.id} value={setter.id}>{setter.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allOffers")}<select name="offer" defaultValue={offerId ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allOffers")}</option>{businessProfile.sales.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.allSources")}<select name="source" defaultValue={source ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("leads.allSources")}</option>{SOURCE_OPTIONS.map((item) => <option key={item} value={item}>{t(`leads.sourceOptions.${item}`)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.from")}<input name="from" type="date" defaultValue={createdFrom} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">{t("leads.to")}<input name="to" type="date" defaultValue={createdTo} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
        <label className="flex min-h-10 items-center gap-2 text-sm font-bold lg:col-span-3"><input name="overdue" value="1" type="checkbox" defaultChecked={params.overdue === "1"} className="size-4 accent-accent" />{t("leads.overdueAction")}</label>
        <Button type="submit" variant="outline">{t("leads.open")}</Button>
      </form>
      {leads.length === 0 ? <p className="sticker-card p-8 text-center text-muted-foreground">{t("leads.empty")}</p> : <CrmLeadList leads={leads} setters={setters} offers={businessProfile.sales.offers} closers={closers} canAssign={hasCrmPermission(access, "crm:assign")} />}
    </div>
  );
}
