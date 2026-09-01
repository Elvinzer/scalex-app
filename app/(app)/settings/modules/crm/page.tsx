import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";

import { CrmToggle } from "./crm-toggle";

export default async function CrmModuleSettingsPage() {
  const t = await getTranslations("crm.activation");
  const { userId, user } = await getCurrentUser();
  await requireOwnerOrRedirect(userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("eyebrow")}</p>
        <h1 className="mt-1 text-3xl font-bold">{t("settings")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("description")}</p>
      </div>
      <section className="sticker-card flex flex-col gap-5 p-6 sm:p-8" aria-labelledby="crm-settings-title">
        <div>
          <h2 id="crm-settings-title" className="text-xl font-bold">{t("title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("ownerOnly")}</p>
        </div>
        <CrmToggle enabled={user?.crmEnabled ?? false} />
      </section>
      <Button asChild variant="outline" className="self-start">
        <Link href="/settings">{t("later")}</Link>
      </Button>
    </div>
  );
}
