import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAuthIdentity } from "@/lib/auth/request";
import { listUserBusinesses } from "@/lib/businesses/queries";
import { requireCrmAccess } from "@/lib/crm/access";
import { readCrmExtensionAuthQuery } from "@/lib/crm/extension-auth";
import { ensureUserRow } from "@/lib/current-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("businesses");
  return { title: t("extensionAuth.title"), robots: { index: false, follow: false } };
}

export default async function ExtensionBusinessSelectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["redirect_uri", "state"]) if (typeof input[key] === "string") params.set(key, input[key]);
  const query = readCrmExtensionAuthQuery(params);
  const t = await getTranslations("businesses");
  if (!query) return <main className="mx-auto max-w-xl px-5 py-16"><p role="alert">{t("extensionAuth.invalidRequest")}</p></main>;
  const identity = await getAuthIdentity();
  if (!identity) redirect(`/sign-in?${params.toString()}`);
  if (identity.email) await ensureUserRow(identity.userId, identity.email);
  const businesses = await listUserBusinesses(identity.userId);
  const choices = await Promise.all(businesses.map(async (business) => ({ ...business, available: business.active && Boolean(await requireCrmAccess(identity.userId, "crm:view", business.id)) })));
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-12 sm:py-20">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("extensionAuth.title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("extensionAuth.description")}</p>
      </div>
      {choices.length === 0 ? <p className="sticker-card p-5 text-sm text-muted-foreground">{t("extensionAuth.empty")}</p> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {choices.map((business) => (
            <article key={business.id} className="sticker-card flex min-w-0 flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <h2 className="break-words text-lg font-bold">{business.name}</h2>
                  <p className="text-sm text-muted-foreground">{business.isOwner ? t("owner") : t("member")}</p>
                  {!business.available && <p className="text-sm text-muted-foreground">{t("extensionAuth.unavailable")}</p>}
                </div>
              </div>
              <form action="/extension/auth/complete" method="get" className="mt-auto">
                <input type="hidden" name="redirect_uri" value={query.redirect_uri} />
                <input type="hidden" name="state" value={query.state} />
                <input type="hidden" name="businessId" value={business.id} />
                <Button type="submit" variant="outline" disabled={!business.available} className="h-auto min-h-10 whitespace-normal text-left">{t("extensionAuth.connect", { business: business.name })}</Button>
              </form>
            </article>
          ))}
        </div>
      )}
      <a href="/businesses" className="inline-flex text-sm font-medium underline underline-offset-4">{t("extensionAuth.back")}</a>
    </main>
  );
}
