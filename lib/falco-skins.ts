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

// "Voir la page du levier →" (Copilote hub chat header) and the panel's
// deep links (bubble's "Ouvrir dans le Copilote →" does the reverse lookup).
export const AGENT_KEY_TO_ROUTE: Record<string, string> = {
  email_marketing: "/acquisition/mail",
  content: "/acquisition/contenu",
  setting: "/acquisition/setting",
  ads: "/acquisition/ads",
  closing: "/ventes/closing",
  produits: "/ventes/produits",
  upsell_ascension: "/ventes/upsell",
};

// "Spécialité" line under each agent's name in the Copilote hub panel —
// short and factual, distinct from the agent's own persona/system prompt.
export const AGENT_KEY_TO_SPECIALTY: Record<string, string> = {
  email_marketing: "Email marketing",
  content: "Contenu organique",
  setting: "Prospection & DM",
  ads: "Publicité payante",
  closing: "Vente & closing",
  produits: "Offres & pricing",
  upsell_ascension: "Ascension client",
};

// Same topicLabel each lever's own page already uses in its ChatContext —
// reused here so the Copilote hub's "Ça, c'est le rayon de Falco X — tu le
// trouves sur la page Y" phrasing stays identical regardless of where the
// conversation is opened from.
export const AGENT_KEY_TO_TOPIC_LABEL: Record<string, string> = {
  email_marketing: "Emailing",
  content: "Contenu",
  setting: "Setting",
  ads: "Ads",
  closing: "Closing",
  produits: "Produits",
  upsell_ascension: "Upsell",
};

// Reverse of AGENT_KEY_TO_ROUTE, for the floating bubble's "Ouvrir dans le
// Copilote →" deep link — only resolves when the current route maps 1:1 to
// a real agent (e.g. /acquisition/mail); routes whose skin is shared by
// several agents (both Setting and Ads use "acquisition") or with no agent
// at all fall back to the hub with no ?agent= param, never a guess.
export function resolveAgentKeyForRoute(pathname: string): string | null {
  let best: { agentKey: string; route: string } | null = null;
  for (const [agentKey, route] of Object.entries(AGENT_KEY_TO_ROUTE)) {
    if (pathname.startsWith(route) && (best === null || route.length > best.route.length)) {
      best = { agentKey, route };
    }
  }
  return best?.agentKey ?? null;
}
