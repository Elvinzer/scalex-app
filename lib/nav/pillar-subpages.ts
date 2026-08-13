import type { PermissionKey } from "@/lib/team/permissions";

export type PillarSubpage = { href: string; label: string; permission: PermissionKey };

// Single source of truth for each pillar's sub-pages — consumed by the
// pillar's own tab bar (app/(app)/acquisition/layout.tsx,
// app/(app)/ventes/layout.tsx; see components/pillar-tabs.tsx). The sidebar
// (components/app-sidebar.tsx) uses the same list for its expandable groups.
// Pipeline is a sales-execution page, so it lives under Vente even though its
// permission key remains acquisition-scoped for backwards compatibility with
// existing team roles. Setter management lives under account team settings.
export const PILLAR_SUBPAGES: Record<string, PillarSubpage[]> = {
  "/acquisition": [
    { href: "/acquisition/contenu", label: "Contenu", permission: "acquisition:contenu" },
    { href: "/acquisition/mail", label: "Mail", permission: "acquisition:mail" },
    { href: "/acquisition/ads", label: "Ads", permission: "acquisition:ads" },
  ],
  "/ventes": [
    { href: "/ventes/pipeline", label: "Pipeline", permission: "acquisition:pipeline" },
    { href: "/ventes/suivi", label: "Suivi des ventes", permission: "ventes:suivi" },
    { href: "/ventes/appels", label: "Suivi des appels", permission: "ventes:appels" },
    { href: "/ventes/rdv", label: "Rendez-vous", permission: "ventes:rdv" },
  ],
};
