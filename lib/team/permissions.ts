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
  "acquisition:setting",
  "acquisition:ads",
  "ventes:suivi",
  "ventes:videos",
  "ventes:closing",
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
  "ventes:suivi": "Ventes — Suivi des ventes",
  "ventes:videos": "Ventes — Vidéos de closing",
  "ventes:closing": "Ventes — Closing",
  business: "Mon business",
};

// Seeded once per account, lazily, the first time an owner opens
// /settings/equipe (see lib/team/roles.ts) — freely editable afterwards,
// including adding permissions beyond these defaults.
export const DEFAULT_ROLES: { key: string; name: string; permissions: PermissionKey[] }[] = [
  { key: "setting", name: "Setting", permissions: ["acquisition:setting"] },
  { key: "closing", name: "Closing", permissions: ["ventes:closing"] },
  { key: "financier", name: "Financier", permissions: ["ventes:suivi", "datas", "dashboard"] },
];
