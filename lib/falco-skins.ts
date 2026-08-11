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
  { prefix: "/acquisition/ads", skin: "acquisition" },
  { prefix: "/acquisition/pipeline", skin: "acquisition" },
  { prefix: "/acquisition/setters", skin: "acquisition" },
  { prefix: "/ventes/pipeline", skin: "acquisition" },
  { prefix: "/ventes/setters", skin: "acquisition" },
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
// Consolidated to 4 agents (was 7): "ventes" (was closing+produits+
// upsell_ascension) keeps the "vente" skin for the operational and offer
// surfaces that already shared it;
// "ceo_vision" (was setting+ads) reuses "acquisition" — no dedicated "CEO"
// illustrated skin exists among the 6 real renders, so this reuses the
// closest existing asset rather than inventing one.
export const AGENT_KEY_TO_SKIN: Record<string, FalcoSkinKey> = {
  email_marketing: "mail",
  content: "contenu",
  ventes: "vente",
  ceo_vision: "acquisition",
};

// "Voir la page du levier →" (Copilote hub chat header) and the panel's
// deep links (bubble's "Ouvrir dans le Copilote →" does the reverse lookup).
export const AGENT_KEY_TO_ROUTE: Record<string, string> = {
  email_marketing: "/acquisition/mail",
  content: "/acquisition/contenu",
  ventes: "/business#offres",
  // Pipeline is ceo_vision's canonical page — Setting's old standalone
  // route is gone, its day-by-day funnel content now lives nested at
  // /ventes/pipeline/funnel (the legacy Acquisition URL redirects there).
  ceo_vision: "/ventes/pipeline",
};

// "Spécialité" line under each agent's name in the Copilote hub panel —
// short and factual, distinct from the agent's own persona/system prompt.
export const AGENT_KEY_TO_SPECIALTY: Record<string, string> = {
  email_marketing: "Email marketing",
  content: "Contenu vidéo",
  ventes: "Closing, offres & ascension",
  ceo_vision: "Vision stratégique d'ensemble",
};

// Same topicLabel each lever's own page already uses in its ChatContext —
// reused here so the Copilote hub's "Ça, c'est le rayon de Falco X — tu le
// trouves sur la page Y" phrasing stays identical regardless of where the
// conversation is opened from.
export const AGENT_KEY_TO_TOPIC_LABEL: Record<string, string> = {
  email_marketing: "Emailing",
  content: "Contenu",
  ventes: "Ventes",
  ceo_vision: "Vision",
};

// For the floating bubble's "Ouvrir dans le Copilote →" deep link — a
// separate rules LIST rather than a reverse of AGENT_KEY_TO_ROUTE, because
// several routes now intentionally point to the same consolidated agent
// (ceo_vision absorbs Setting+Ads, ventes covers Appels plus Mon business).
// Longest-prefix wins, same convention as SKIN_ROUTE_RULES above.
const AGENT_ROUTE_RULES: { route: string; agentKey: string }[] = [
  { route: "/acquisition/mail", agentKey: "email_marketing" },
  { route: "/acquisition/contenu", agentKey: "content" },
  { route: "/acquisition/ads", agentKey: "ceo_vision" },
  { route: "/acquisition/pipeline", agentKey: "ceo_vision" },
  { route: "/acquisition/setters", agentKey: "ceo_vision" },
  { route: "/ventes/pipeline", agentKey: "ceo_vision" },
  { route: "/ventes/setters", agentKey: "ceo_vision" },
  { route: "/business", agentKey: "ventes" },
  // Covers /ventes/appels itself plus its nested /funnel (ex-Closing) and
  // /videos pages via prefix match — Closing's old standalone rule pointed
  // only at itself, leaving Appels with no agent resolution at all.
  { route: "/ventes/appels", agentKey: "ventes" },
];

export function resolveAgentKeyForRoute(pathname: string): string | null {
  let best: { agentKey: string; route: string } | null = null;
  for (const rule of AGENT_ROUTE_RULES) {
    if (pathname.startsWith(rule.route) && (best === null || rule.route.length > best.route.length)) {
      best = rule;
    }
  }
  return best?.agentKey ?? null;
}
