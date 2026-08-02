import type { PermissionKey } from "@/lib/team/permissions";

export type PillarSubpage = { href: string; label: string; permission: PermissionKey };

// Single source of truth for each pillar's sub-pages — consumed by both the
// pillar's own tab bar (app/(app)/acquisition/layout.tsx,
// app/(app)/ventes/layout.tsx) and the sidebar's hover flyout
// (components/app-sidebar.tsx), so the two listings can't drift apart.
// Setting/Closing/Vidéos are deliberately absent here, same "hide, don't
// delete" precedent already applied to their tabs.
export const PILLAR_SUBPAGES: Record<string, PillarSubpage[]> = {
  "/acquisition": [
    { href: "/acquisition/contenu", label: "Contenu", permission: "acquisition:contenu" },
    { href: "/acquisition/mail", label: "Mail", permission: "acquisition:mail" },
    { href: "/acquisition/pipeline", label: "Pipeline", permission: "acquisition:pipeline" },
    { href: "/acquisition/setters", label: "Setters", permission: "acquisition:setters" },
    { href: "/acquisition/ads", label: "Ads", permission: "acquisition:ads" },
  ],
  "/ventes": [
    { href: "/ventes/suivi", label: "Suivi des ventes", permission: "ventes:suivi" },
    { href: "/ventes/appels", label: "Suivi des appels", permission: "ventes:appels" },
    { href: "/ventes/produits", label: "Produits", permission: "business" },
    { href: "/ventes/upsell", label: "Upsell", permission: "ventes:upsell" },
  ],
};
