import { getTranslations } from "next-intl/server";

import { isAdminEmail } from "@/lib/admin";
import { getUserById, requireUserId } from "@/lib/current-user";

import { CreateBusinessForm } from "./create-business-form";

export default async function NewBusinessPage() {
  const userId = await requireUserId();
  const [user, t] = await Promise.all([getUserById(userId), getTranslations("businesses")]);
  return (
    <section className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("new.title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("new.description")}</p>
      </div>
      <div className="sticker-card p-5 sm:p-6"><CreateBusinessForm requestId={crypto.randomUUID()} isAdmin={Boolean(user && isAdminEmail(user.email))} /></div>
    </section>
  );
}
