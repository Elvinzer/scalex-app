import { PillarTabs, type PillarTab } from "@/components/pillar-tabs";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin, type FalcoSkinKey } from "@/lib/falco-skins";
import { getAccountContext } from "@/lib/team/context";

// Setting is replaced by Pipeline in the visible tabs (its page.tsx still
// exists, still gates access via requirePermissionOrRedirect, just no
// longer a discoverable tab — same "hide, don't delete" precedent as
// Journal/Avancé). Ads is relinked here alongside Pipeline/Setters (it was
// delinked in an earlier chantier, explicitly brought back for this one).
export default async function AcquisitionLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const permissions: ReadonlySet<string> = context && !context.isOwner ? context.permissions : new Set();

  function hasAccess(key: string): boolean {
    return isOwner || permissions.has(key);
  }

  const visibleTabs = [
    { href: "/acquisition/contenu", label: "Contenu", visible: hasAccess("acquisition:contenu") },
    { href: "/acquisition/mail", label: "Mail", visible: hasAccess("acquisition:mail") },
    { href: "/acquisition/pipeline", label: "Pipeline", visible: hasAccess("acquisition:pipeline") },
    { href: "/acquisition/setters", label: "Setters", visible: hasAccess("acquisition:setters") },
    { href: "/acquisition/ads", label: "Ads", visible: hasAccess("acquisition:ads") },
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
      <h1 className="text-3xl font-bold">Acquisition</h1>
      <PillarTabs tabs={tabs} />
      {children}
    </div>
  );
}
