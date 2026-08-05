import type { PermissionKey } from "@/lib/team/permissions";

export type PillarSubpage = { href: string; label: string; permission: PermissionKey };

// Single source of truth for each pillar's sub-pages — consumed by the
// pillar's own tab bar (app/(app)/acquisition/layout.tsx,
// app/(app)/ventes/layout.tsx; see components/pillar-tabs.tsx). The sidebar
// (components/app-sidebar.tsx) no longer mirrors this list in a hover
// flyout — it just links to the pillar's landing page, which redirects into
// this same tab bar. Setting/Closing/Vidéos are deliberately absent here,
// same "hide, don't delete" precedent already applied to their tabs.
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
    { href: "/ventes/rdv", label: "Rendez-vous", permission: "ventes:rdv" },
    { href: "/ventes/produits", label: "Produits", permission: "business" },
    { href: "/ventes/upsell", label: "Upsell", permission: "ventes:upsell" },
  ],
};
