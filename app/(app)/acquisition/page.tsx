import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { funnelBlockHref } from "@/lib/funnel-blocks/routes";
import { activeFunnelBlockEntries, normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";

// Bare /acquisition always lands on its first tab — Contenu is the one
// every account can reach regardless of the Avancé gate (Setting/Ads may
// not be visible yet, see layout.tsx).
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

  const { accountId } = await getCurrentUser();
  const [businessProfile, blockCatalog] = await Promise.all([
    getBusinessProfile(accountId),
    getFunnelBlockCatalog(),
  ]);
  const selection = normalizeFunnelBlockSelection(businessProfile.acquisition, blockCatalog);
  const firstBlock = activeFunnelBlockEntries(selection, blockCatalog)[0];
  redirect(firstBlock ? funnelBlockHref(firstBlock.blockKey) : "/business#acquisition");
}
