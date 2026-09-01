import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { getCrmActions } from "@/lib/crm/queries";
import { crmActionCategorySchema } from "@/lib/crm/schemas";

import { CrmActionList } from "../crm-action-list";

export default async function CrmActionsPage({ searchParams }: { searchParams: Promise<{ overdue?: string; team?: string; category?: string; relances?: string; status?: string }> }) {
  const t = await getTranslations("crm");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) return null;
  const params = await searchParams;
  const teamView = params.team === "1" && hasCrmPermission(access, "crm:view-team");
  const category = crmActionCategorySchema.safeParse(params.category).success ? crmActionCategorySchema.parse(params.category) : undefined;
  const status = params.status === "completed" || params.status === "cancelled" || params.status === "open" ? params.status : "open";
  const actions = await getCrmActions(access.accountId, { status, category, relanceOnly: params.relances === "1", overdueOnly: params.overdue === "1", responsibleUserId: teamView ? undefined : userId });
  const query = (overrides: Record<string, string | null>) => {
    const next = new URLSearchParams();
    if (teamView && overrides.team !== null) next.set("team", "1");
    if (status !== "open" && overrides.status !== null) next.set("status", status);
    if (category && overrides.category !== null) next.set("category", category);
    if (params.relances === "1" && overrides.relances !== null) next.set("relances", "1");
    if (params.overdue === "1" && overrides.overdue !== null) next.set("overdue", "1");
    for (const [key, value] of Object.entries(overrides)) if (value !== null && !next.has(key)) next.set(key, value);
    const value = next.toString();
    return value ? `/crm/actions?${value}` : "/crm/actions";
  };
  return <div className="flex flex-col gap-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{t("actions.title")}</h2><p className="mt-1 text-muted-foreground">{t("actions.subtitle")}</p></div><div className="flex flex-wrap gap-2"><Button asChild variant={params.overdue === "1" ? "default" : "outline"}><Link href={query({ overdue: params.overdue === "1" ? null : "1" })}>{t("actions.overdue")}</Link></Button><Button asChild variant={params.relances === "1" ? "default" : "outline"}><Link href={query({ relances: params.relances === "1" ? null : "1" })}>{t("actions.relances")}</Link></Button>{hasCrmPermission(access, "crm:view-team") && <Button asChild variant="outline"><Link href={teamView ? "/crm/actions" : query({ team: "1" })}>{teamView ? t("today.myView") : t("today.teamView")}</Link></Button>}</div></div><form method="get" className="sticker-card grid gap-3 p-4 sm:grid-cols-3"><label className="flex flex-col gap-1 text-sm font-bold">{t("actions.category")}<select name="category" defaultValue={category ?? ""} className="min-h-10 rounded border border-border bg-background px-2 font-normal"><option value="">{t("actions.all")}</option><option value="prospecting">{t("actions.prospecting")}</option><option value="sales">{t("actions.sales")}</option><option value="appointment">{t("actions.appointment")}</option></select></label><label className="flex flex-col gap-1 text-sm font-bold">{t("actions.status")}<select name="status" defaultValue={status} className="min-h-10 rounded border border-border bg-background px-2 font-normal"><option value="open">{t("actions.open")}</option><option value="completed">{t("actions.completed")}</option><option value="cancelled">{t("actions.cancelled")}</option></select></label><Button type="submit" variant="outline">{t("actions.filter")}</Button></form><CrmActionList initialActions={actions} /></div>;
}
