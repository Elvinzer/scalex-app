import { PillarTabs, type PillarTab } from "@/components/pillar-tabs";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin, type FalcoSkinKey } from "@/lib/falco-skins";
import { PILLAR_SUBPAGES } from "@/lib/nav/pillar-subpages";
import { getAccountContext } from "@/lib/team/context";

// Closing and Vidéos are gone as their own tabs/routes — their content was
// folded into Appels as nested pages (/ventes/appels/funnel,
// /ventes/appels/videos, linked from Appels itself, not from this tab bar).
export default async function VentesLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const permissions: ReadonlySet<string> = context && !context.isOwner ? context.permissions : new Set();

  function hasAccess(key: string): boolean {
    return isOwner || permissions.has(key);
  }

  const visibleTabs = PILLAR_SUBPAGES["/ventes"].filter((tab) => hasAccess(tab.permission));

  const tabs: PillarTab[] = visibleTabs.map(({ href, label }) => ({ href, label }));

  // Prefetch this pillar's own tabs' skins — switching tabs shouldn't
  // require a fresh image fetch each time.
  const skinsToPrefetch = Array.from(
    new Set(visibleTabs.map((tab) => resolveFalcoSkin(tab.href)).filter((skin): skin is FalcoSkinKey => skin !== null))
  );

  return (
    <div className="flex flex-col gap-6">
      {skinsToPrefetch.map((skin) => (
        <link key={skin} rel="prefetch" as="image" href={`/falco/skins/falco-skin-${skin}.webp`} />
      ))}
      <div>
        <h1 className="text-3xl font-bold">Vente</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">Suis tes deals, tes échéances et tes appels pour savoir ce qui rentre vraiment.</p>
      </div>
      <PillarTabs tabs={tabs} />
      {children}
    </div>
  );
}
