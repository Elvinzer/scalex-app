import { PillarTabs, type PillarTab } from "@/components/pillar-tabs";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin, type FalcoSkinKey } from "@/lib/falco-skins";
import { PILLAR_SUBPAGES } from "@/lib/nav/pillar-subpages";
import { getAccountContext } from "@/lib/team/context";

// Setting is gone as its own tab/route. Pipeline and Setters now belong to
// the Vente pillar; the legacy Acquisition URLs redirect there. The active
// journey remains available from the dashboard and Mes chiffres, but does
// not create extra Acquisition tabs.
export default async function AcquisitionLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app.acquisition");
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const permissions: ReadonlySet<string> = context && !context.isOwner ? context.permissions : new Set();

  function hasAccess(key: string): boolean {
    return isOwner || permissions.has(key);
  }

  const visibleTabs = PILLAR_SUBPAGES["/acquisition"].filter((tab) => hasAccess(tab.permission));

  const canAccessAcquisition = isOwner || visibleTabs.length > 0;
  const tabs: PillarTab[] = [
    ...visibleTabs.map(({ href, label }) => ({ href, label })),
    ...(canAccessAcquisition ? [{ href: "/business#acquisition", label: t("editJourney") }] : []),
  ];

  // Prefetch this pillar's own tabs' skins — switching tabs shouldn't
  // require a fresh image fetch each time.
  const skinsToPrefetch = Array.from(
    new Set(
      [...visibleTabs]
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
