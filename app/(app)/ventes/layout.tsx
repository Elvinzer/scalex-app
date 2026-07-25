import { PillarTabs, type PillarTab } from "@/components/pillar-tabs";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin, type FalcoSkinKey } from "@/lib/falco-skins";
import { getAccountContext } from "@/lib/team/context";

// Closing (former "Avancé" showcase module) is deliberately set aside
// again — not rendered as a tab here, not linked anywhere. Its page.tsx
// still exists and still gates access via requirePermissionOrRedirect, but
// this layout no longer surfaces it as a discoverable tab.
export default async function VentesLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const permissions: ReadonlySet<string> = context && !context.isOwner ? context.permissions : new Set();

  function hasAccess(key: string): boolean {
    return isOwner || permissions.has(key);
  }

  const visibleTabs = [
    { href: "/ventes/suivi", label: "Suivi des ventes", visible: hasAccess("ventes:suivi") },
    { href: "/ventes/produits", label: "Produits", visible: hasAccess("business") },
    { href: "/ventes/upsell", label: "Upsell", visible: hasAccess("ventes:upsell") },
  ].filter((tab) => tab.visible);

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
      <h1 className="text-3xl font-bold">Vente</h1>
      <PillarTabs tabs={tabs} />
      {children}
    </div>
  );
}
