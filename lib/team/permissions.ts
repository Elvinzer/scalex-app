// The fixed set of grantable permission keys — one per page a role can be
// scoped to. Adding a new gateable page means adding a key here and to the
// relevant page/Server Action; which ROLE gets which key is DB-configurable
// (db/schema.ts's teamRoles.permissions) and editable by the account owner
// at /settings/equipe, not fixed in code. /settings, /integrations and team
// or billing management are deliberately absent — always owner-only,
// non-grantable (BYOK key, Stripe Connect OAuth, Scale X billing, team
// membership are account-level, not delegable to any role).
export const PERMISSION_KEYS = [
  "dashboard",
  "funnel",
  "datas",
  "diagnostic",
  "acquisition:contenu",
  // Legacy — Setting was folded into Pipeline (its content now lives at
  // /acquisition/pipeline/funnel, gated by "acquisition:pipeline"). Kept
  // grantable, same reasoning as "funnel" above, purely for any role that
  // already has it; see lib/funnel-insights/insight-actions.ts for the one
  // remaining place it's still checked.
  "acquisition:setting",
  "acquisition:ads",
  "acquisition:mail",
  "acquisition:pipeline",
  "acquisition:setters",
  "ventes:suivi",
  "ventes:videos",
  "ventes:rdv",
  // Legacy — Closing was folded into Appels (its content now lives at
  // /ventes/appels/funnel, gated by "ventes:appels"). Same treatment as
  // "acquisition:setting" above.
  "ventes:closing",
  "ventes:appels",
  "ventes:upsell",
  "business",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  dashboard: "Dashboard",
  funnel: "Funnel",
  datas: "Datas (métriques mensuelles, cash)",
  diagnostic: "Diagnostic",
  "acquisition:contenu": "Acquisition — Contenu",
  "acquisition:setting": "Acquisition — Setting",
  "acquisition:ads": "Acquisition — Ads",
  "acquisition:mail": "Acquisition — Mail",
  "acquisition:pipeline": "Acquisition — Pipeline",
  "acquisition:setters": "Acquisition — Setters",
  "ventes:suivi": "Ventes — Suivi des ventes",
  "ventes:videos": "Ventes — Vidéos de closing",
  "ventes:rdv": "Ventes — Rendez-vous",
  "ventes:closing": "Ventes — Closing",
  "ventes:appels": "Ventes — Suivi des appels (iClosed)",
  "ventes:upsell": "Ventes — Upsell",
  business: "Mon business",
};

// Seeded once per account, lazily, the first time an owner opens
// /settings/equipe (see lib/team/roles.ts) — freely editable afterwards,
// including adding permissions beyond these defaults.
export const DEFAULT_ROLES: { key: string; name: string; permissions: PermissionKey[] }[] = [
  { key: "setting", name: "Setting", permissions: ["acquisition:pipeline", "acquisition:setters"] },
  { key: "closing", name: "Closing", permissions: ["ventes:closing", "ventes:appels", "ventes:rdv"] },
  { key: "financier", name: "Financier", permissions: ["ventes:suivi", "datas", "dashboard"] },
];
