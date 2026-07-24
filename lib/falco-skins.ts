// Single source of truth for "which Falco skin does this route get" —
// consumed by AgentBanner (each lever page resolves its own known route),
// the two headers (Mes chiffres, Diagnostic), the floating chat bubble
// (via usePathname()), and the pillar layouts' prefetch. Assets themselves
// live in public/falco/skins/ (full-body) and public/falco/skins/portraits/
// (chat-bubble crop) — see scripts/prepare-falco-skins.mjs for how they
// were generated from the raw renders.
export type FalcoSkinKey = "mail" | "vente" | "contenu" | "acquisition" | "diagnostic" | "chiffres";

export const FALCO_SKIN_KEYS: FalcoSkinKey[] = ["mail", "vente", "contenu", "acquisition", "diagnostic", "chiffres"];

// Longest-prefix wins, so a more specific rule (e.g. "/acquisition/mail")
// takes priority over a broader one, if one ever existed. Order here
// doesn't matter for correctness (resolveFalcoSkin sorts by prefix length),
// only for readability.
const SKIN_ROUTE_RULES: { prefix: string; skin: FalcoSkinKey }[] = [
  { prefix: "/acquisition/mail", skin: "mail" },
  { prefix: "/acquisition/contenu", skin: "contenu" },
  { prefix: "/acquisition/setting", skin: "acquisition" },
  { prefix: "/acquisition/ads", skin: "acquisition" },
  { prefix: "/ventes", skin: "vente" },
  { prefix: "/datas", skin: "chiffres" },
  { prefix: "/diagnostic", skin: "diagnostic" },
];

// null = no skin for this route — every caller treats that as "render the
// base Falco" (no `skin` prop passed), never a broken/missing-asset state.
export function resolveFalcoSkin(pathname: string): FalcoSkinKey | null {
  let best: { prefix: string; skin: FalcoSkinKey } | null = null;
  for (const rule of SKIN_ROUTE_RULES) {
    if (pathname.startsWith(rule.prefix) && (best === null || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  return best?.skin ?? null;
}

// Alt text for the full-body skin image (AgentBanner, Mes chiffres/Diagnostic headers).
export const FALCO_SKIN_ALT: Record<FalcoSkinKey, string> = {
  mail: "Falco en facteur",
  vente: "Falco en consultant",
  contenu: "Falco en créateur de contenu",
  acquisition: "Falco en média-buyer",
  diagnostic: "Falco en docteur",
  chiffres: "Falco en comptable",
};

// Coarser label for the global floating chat bubble, which only ever knows
// the current ROUTE (never the exact agent_key) — it always opens the
// existing general Copilote context, this is display-only.
export const FALCO_SKIN_CHAT_LABEL: Record<FalcoSkinKey, string> = {
  mail: "Falco Facteur",
  vente: "Falco Conseiller",
  contenu: "Falco Créateur",
  acquisition: "Falco Acquisition",
  diagnostic: "Falco Diagnostic",
  chiffres: "Falco Analyste",
};

// Per-lever-agent mapping (agents_registry.agent_key → skin) — used by
// AgentBanner/ImproveChat to resolve the drawer header/message-avatar
// portrait from the agent the page already knows, distinct from the
// route-based resolution above (needed because the drawer itself doesn't
// know the current pathname).
export const AGENT_KEY_TO_SKIN: Record<string, FalcoSkinKey> = {
  email_marketing: "mail",
  content: "contenu",
  setting: "acquisition",
  ads: "acquisition",
  closing: "vente",
  produits: "vente",
  upsell_ascension: "vente",
};
