import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/current-user";
import { getBusinessProfile } from "@/lib/business/queries";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { getActiveClosers } from "@/lib/closers/queries";
import { getCrmLead, getCrmSetters } from "@/lib/crm/queries";

import { CrmLeadDetail } from "../../crm-lead-detail";

export default async function CrmLeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const t = await getTranslations("crm.detail");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const { leadId } = await params;
  if (!z.string().uuid().safeParse(leadId).success) notFound();
  const [lead, setters, businessProfile, closers] = await Promise.all([getCrmLead(access.accountId, leadId), getCrmSetters(access.accountId), getBusinessProfile(access.accountId), getActiveClosers(access.accountId)]);
  if (!lead) notFound();
  return <div className="flex flex-col gap-4"><p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("title")}</p><CrmLeadDetail initialLead={lead} setters={setters} offers={businessProfile.sales.offers} closers={closers} canAssign={hasCrmPermission(access, "crm:assign")} /></div>;
}
