import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { listUserBusinesses } from "@/lib/businesses/queries";
import { businessHref } from "@/lib/businesses/routing";
import { requireUserId } from "@/lib/current-user";

export default async function BusinessesPage() {
  const userId = await requireUserId();
  const [businesses, t] = await Promise.all([listUserBusinesses(userId), getTranslations("businesses")]);
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("list.title")}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("list.description")}</p>
        </div>
        <Button asChild><Link href="/businesses/new"><Plus className="size-4" aria-hidden="true" />{t("create")}</Link></Button>
      </div>
      {businesses.length === 0 ? <p className="sticker-card p-6 text-sm text-muted-foreground">{t("list.empty")}</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {businesses.map((business) => (
            <article key={business.id} className="sticker-card flex min-w-0 flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <h2 className="break-words text-lg font-bold">{business.name}</h2>
                  <p className="text-sm text-muted-foreground">{business.isOwner ? t("owner") : business.roleLabel || t("member")}</p>
                  {!business.active && <p className="text-sm text-state-critical">{business.isOwner ? t("paymentRequired") : t("suspended")}</p>}
                </div>
              </div>
              <Button asChild variant="outline" className="self-start"><a href={businessHref(business.id, business.active || !business.isOwner ? "/dashboard" : "/settings/facturation")}>{business.active || !business.isOwner ? t("list.open") : t("list.resumePayment")}</a></Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
