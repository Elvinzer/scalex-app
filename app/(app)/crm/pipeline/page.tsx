import { getTranslations } from "next-intl/server";
import { ChevronDown, Plus } from "lucide-react";

import { getCurrentUser } from "@/lib/current-user";
import { getBusinessSalesOfferDetails } from "@/lib/business/queries";
import { getActiveClosers } from "@/lib/closers/queries";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { CRM_PIPELINE_STAGE_PAGE_SIZE } from "@/lib/crm/lead-pagination";
import { getCrmPipelineStagePages, getCrmSetters } from "@/lib/crm/queries";
import { CRM_LEAD_STAGES } from "@/lib/crm/types";
import { withDatabaseReadTimeout } from "@/lib/perf/database-read";

import { CrmLeadCaptureForm } from "../crm-lead-capture-form";
import { CrmStageBoard } from "../crm-stage-board";

export default async function CrmPipelinePage() {
  const t = await getTranslations("crm.pipeline");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const [pages, setters, offers, closers] = await withDatabaseReadTimeout(
    () => Promise.all([
      getCrmPipelineStagePages(access.accountId, {}, { limit: CRM_PIPELINE_STAGE_PAGE_SIZE, offset: 0 }),
      getCrmSetters(access.accountId),
      getBusinessSalesOfferDetails(access.accountId),
      getActiveClosers(access.accountId),
    ]),
    { operation: "crm-pipeline-data", timeoutMs: 15_000 },
  );
  const activeLeadCount = CRM_LEAD_STAGES.reduce((total, stage) => total + pages[stage].totalCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("activeCount", { count: activeLeadCount, stages: CRM_LEAD_STAGES.length })}</p>
        </div>
        <span className="text-sm text-muted-foreground">{setters.length} {t("responsible")}</span>
      </div>
      <details className="sticker-card group overflow-hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-accent/20 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-muted text-foreground">
              <Plus className="size-5 transition-transform duration-[var(--motion-fast)] group-open:rotate-45" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="truncate">{t("addLead")}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-border p-4"><CrmLeadCaptureForm offers={offers} setters={setters} /></div>
      </details>
      <CrmStageBoard initialPages={pages} setters={setters} offers={offers} closers={closers} canAssign={hasCrmPermission(access, "crm:assign")} canManagePipeline={hasCrmPermission(access, "crm:manage-pipeline")} />
    </div>
  );
}
