import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

// Bare /acquisition always lands on Contenu. The pillar layout keeps the
// navigation tabs and any account-specific journey pages available there.
export default async function AcquisitionIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ blocked?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("app.acquisition");

  if (params.blocked) {
    return (
      <section className="sticker-card max-w-2xl p-6" aria-labelledby="acquisition-blocked-title">
        <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">Acquisition</p>
        <h2 id="acquisition-blocked-title" className="mt-2 text-xl font-bold">{t("blockedTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("blockedBody")}</p>
        <Button asChild className="mt-5">
          <Link href="/business#acquisition">{t("goToBusiness")}</Link>
        </Button>
      </section>
    );
  }

  redirect("/acquisition/contenu");
}
