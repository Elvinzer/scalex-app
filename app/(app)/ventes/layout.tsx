import { PillarTabs, type PillarTab } from "@/components/pillar-tabs";
import { getCurrentUser } from "@/lib/current-user";
import { getAccountContext } from "@/lib/team/context";

// Same reasoning as app/(app)/acquisition/layout.tsx — Closing existed in
// code but had no navigation entry point before this restructuring; this
// layout only decides tab discoverability (Avancé gate, unchanged), each
// page keeps its own requirePermissionOrRedirect as the real access check.
export default async function VentesLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const permissions: ReadonlySet<string> = context && !context.isOwner ? context.permissions : new Set();
  const advancedModulesEnabled = context?.advancedModulesEnabled ?? false;

  function hasAccess(key: string): boolean {
    return isOwner || permissions.has(key);
  }

  const tabs: PillarTab[] = [
    { href: "/ventes/produits", label: "Produits", visible: hasAccess("business") },
    { href: "/ventes/suivi", label: "Suivi des ventes", visible: hasAccess("ventes:suivi") },
    { href: "/ventes/closing", label: "Closing", visible: hasAccess("ventes:closing") && advancedModulesEnabled },
    { href: "/ventes/upsell", label: "Upsell", visible: hasAccess("ventes:upsell") },
  ]
    .filter((tab) => tab.visible)
    .map(({ href, label }) => ({ href, label }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Vente</h1>
      <PillarTabs tabs={tabs} />
      {children}
    </div>
  );
}
