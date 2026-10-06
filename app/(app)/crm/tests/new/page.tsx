import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/current-user";
import { requireCrmAccess } from "@/lib/crm/access";

import { CrmMessageTestCreateForm } from "../message-test-create-form";

export default async function CrmMessageTestCreatePage() {
  const [{ userId }, t] = await Promise.all([getCurrentUser(), getTranslations("crm.messageTests")]);
  const access = await requireCrmAccess(userId, "crm:manage-message-tests");
  if (!access) redirect("/crm/tests");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("form.eyebrow")}</p>
        <h1 className="mt-1 text-3xl font-bold">{t("form.title")}</h1>
      </div>
      <CrmMessageTestCreateForm />
    </div>
  );
}
