import { PillarTabs, type PillarTab } from "@/components/pillar-tabs";
import { getCurrentUser } from "@/lib/current-user";
import { getAccountContext } from "@/lib/team/context";

// Setting/Ads existed in code already but were linked from NO navigation
// (only teased in the dead "Avancé" showcase) — this layout is their first
// real entry point. Their own page.tsx keeps gating actual access via
// requirePermissionOrRedirect exactly as before (unchanged); this layout
// only decides which tabs are DISCOVERABLE, same "Avancé" gate as today
// (advancedModulesEnabled) — a direct URL visit still worked without it
// pre-restructuring, so this preserves that behavior rather than tightening it.
export default async function AcquisitionLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const permissions: ReadonlySet<string> = context && !context.isOwner ? context.permissions : new Set();
  const advancedModulesEnabled = context?.advancedModulesEnabled ?? false;

  function hasAccess(key: string): boolean {
    return isOwner || permissions.has(key);
  }

  const tabs: PillarTab[] = [
    { href: "/acquisition/contenu", label: "Contenu", visible: hasAccess("acquisition:contenu") },
    { href: "/acquisition/setting", label: "Setting", visible: hasAccess("acquisition:setting") && advancedModulesEnabled },
    { href: "/acquisition/ads", label: "Ads", visible: hasAccess("acquisition:ads") && advancedModulesEnabled },
  ]
    .filter((tab) => tab.visible)
    .map(({ href, label }) => ({ href, label }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Acquisition</h1>
      <PillarTabs tabs={tabs} />
      {children}
    </div>
  );
}
