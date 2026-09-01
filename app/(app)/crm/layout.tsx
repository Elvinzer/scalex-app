import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { PillarTabs, type PillarTab } from "@/components/pillar-tabs";
import { getCurrentUser } from "@/lib/current-user";
import { requireCrmAccess } from "@/lib/crm/access";
import { PILLAR_SUBPAGES } from "@/lib/nav/pillar-subpages";
import { getAccountContext } from "@/lib/team/context";

import { CrmDisabledState } from "./crm-disabled-state";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  if (!context) redirect("/dashboard");
  const t = await getTranslations("crm");
  if (!context.crmEnabled) {
    if (!context.isOwner && !context.permissions.has("crm:view")) redirect("/dashboard");
    return <div className="flex flex-col gap-6"><div><p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("title")}</p><h1 className="mt-1 text-3xl font-bold">{t("title")}</h1><p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p></div><CrmDisabledState isOwner={context.isOwner} /></div>;
  }
  const access = await requireCrmAccess(userId);
  if (!access) redirect("/dashboard");
  const tabs: PillarTab[] = (PILLAR_SUBPAGES["/crm"] ?? []).map(({ href, label }) => ({ href, label }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("title")}</p>
        <h1 className="mt-1 text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PillarTabs tabs={tabs} />
      {children}
    </div>
  );
}
