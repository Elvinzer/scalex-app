import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/current-user";
import { getBusinessProfile } from "@/lib/business/queries";
import { getActiveClosers } from "@/lib/closers/queries";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { getCrmLeads, getCrmSetters } from "@/lib/crm/queries";

import { CrmLeadCaptureForm } from "../crm-lead-capture-form";
import { CrmStageBoard } from "../crm-stage-board";

export default async function CrmPipelinePage() {
  const t = await getTranslations("crm.pipeline");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const [leads, setters, businessProfile, closers] = await Promise.all([getCrmLeads(access.accountId), getCrmSetters(access.accountId), getBusinessProfile(access.accountId), getActiveClosers(access.accountId)]);

  return <div className="flex flex-col gap-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{t("title")}</h2><p className="mt-1 text-muted-foreground">{t("subtitle")}</p></div><span className="text-sm text-muted-foreground">{setters.length} {t("responsible")}</span></div><CrmLeadCaptureForm offers={businessProfile.sales.offers} setters={setters} /><CrmStageBoard initialLeads={leads} setters={setters} offers={businessProfile.sales.offers} closers={closers} canAssign={hasCrmPermission(access, "crm:assign")} /></div>;
}
