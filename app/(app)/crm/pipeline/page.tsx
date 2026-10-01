import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/current-user";
import { getBusinessSalesOfferDetails } from "@/lib/business/queries";
import { getActiveClosers } from "@/lib/closers/queries";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { CRM_PIPELINE_LEAD_LIMIT } from "@/lib/crm/lead-pagination";
import { getCrmLeads, getCrmSetters } from "@/lib/crm/queries";
import { withDatabaseReadTimeout } from "@/lib/perf/database-read";

import { CrmLeadCaptureForm } from "../crm-lead-capture-form";
import { CrmStageBoard } from "../crm-stage-board";

export default async function CrmPipelinePage() {
  const t = await getTranslations("crm.pipeline");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const [leads, setters, offers, closers] = await withDatabaseReadTimeout(
    () => Promise.all([
      getCrmLeads(access.accountId, { excludeLost: true }, { limit: CRM_PIPELINE_LEAD_LIMIT }),
      getCrmSetters(access.accountId),
      getBusinessSalesOfferDetails(access.accountId),
      getActiveClosers(access.accountId),
    ]),
    { operation: "crm-pipeline-data", timeoutMs: 15_000 },
  );

  return <div className="flex flex-col gap-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{t("title")}</h2><p className="mt-1 text-muted-foreground">{t("subtitle")}</p></div><span className="text-sm text-muted-foreground">{setters.length} {t("responsible")}</span></div><CrmLeadCaptureForm offers={offers} setters={setters} /><CrmStageBoard initialLeads={leads} setters={setters} offers={offers} closers={closers} canAssign={hasCrmPermission(access, "crm:assign")} canManagePipeline={hasCrmPermission(access, "crm:manage-pipeline")} /></div>;
}
