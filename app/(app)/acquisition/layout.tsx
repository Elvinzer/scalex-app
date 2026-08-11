import { PillarTabs, type PillarTab } from "@/components/pillar-tabs";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin, type FalcoSkinKey } from "@/lib/falco-skins";
import { PILLAR_SUBPAGES } from "@/lib/nav/pillar-subpages";
import { getAccountContext } from "@/lib/team/context";
import { getBusinessProfile } from "@/lib/business/queries";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeFunnelRoutes } from "@/lib/acquisition-funnels/routes";
import { normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";

// Setting is gone as its own tab/route — its day-by-day funnel content was
// folded into Pipeline as a nested page (/acquisition/pipeline/funnel,
// linked from Pipeline itself, not from this tab bar). Ads is relinked here
// alongside Pipeline/Setters (it was delinked in an earlier chantier,
// explicitly brought back for this one).
export default async function AcquisitionLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app.acquisition");
  const { userId, accountId } = await getCurrentUser();
  const [context, businessProfile, catalog] = await Promise.all([
    getAccountContext(userId),
    getBusinessProfile(accountId),
    getAcquisitionFunnelCatalog(),
  ]);
  const isOwner = context?.isOwner ?? false;
  const permissions: ReadonlySet<string> = context && !context.isOwner ? context.permissions : new Set();

  function hasAccess(key: string): boolean {
    return isOwner || permissions.has(key);
  }

  const visibleTabs = PILLAR_SUBPAGES["/acquisition"].filter((tab) => hasAccess(tab.permission));

  const canAccessAcquisition = isOwner || visibleTabs.length > 0;
  const activeJourneyTabs: PillarTab[] = canAccessAcquisition
    ? activeFunnelRoutes(
        normalizeAcquisitionSelection(businessProfile.acquisition, catalog),
        catalog
      ).map((route) => ({ href: route.href, label: route.primary ? `${route.label} · principal` : route.label }))
    : [];
  const tabs: PillarTab[] = [
    ...visibleTabs.map(({ href, label }) => ({ href, label })),
    ...activeJourneyTabs,
    ...(canAccessAcquisition ? [{ href: "/business#acquisition", label: t("addFunnel") }] : []),
  ];

  // Prefetch this pillar's own tabs' skins — switching tabs shouldn't
  // require a fresh image fetch each time.
  const skinsToPrefetch = Array.from(
    new Set(
      [...visibleTabs, ...activeJourneyTabs]
        .map((tab) => resolveFalcoSkin(tab.href))
        .filter((skin): skin is FalcoSkinKey => skin !== null)
    )
  );

  return (
    <div className="flex flex-col gap-6">
      {skinsToPrefetch.map((skin) => (
        <link key={skin} rel="prefetch" as="image" href={`/falco/skins/falco-skin-${skin}.webp`} />
      ))}
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PillarTabs tabs={tabs} />
      {children}
    </div>
  );
}
