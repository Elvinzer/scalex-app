import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getCurrentUser } from "@/lib/current-user";
import { hasCrmPermission, requireCrmAccess } from "@/lib/crm/access";
import { getCrmMessageAbTest } from "@/lib/crm/message-ab-tests";

import { CrmMessageTestDetail } from "../message-test-detail";

export default async function CrmMessageTestDetailPage({ params }: { params: Promise<{ testId: string }> }) {
  const [{ userId }, { testId }, locale] = await Promise.all([getCurrentUser(), params, getLocale()]);
  const access = await requireCrmAccess(userId, "crm:view");
  if (!access) redirect("/dashboard");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testId)) notFound();
  const test = await getCrmMessageAbTest(access.accountId, testId);
  if (!test) notFound();

  return <CrmMessageTestDetail test={test} canManage={hasCrmPermission(access, "crm:manage-message-tests")} locale={locale} />;
}
