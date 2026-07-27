// Old agentKey → consolidated agent that absorbed it (7 agents → 4). Every
// page/card that still builds a ChatContext with a retired key (ads/
// setting/closing/produits/upsell_ascension — lever pages' own AgentBanner,
// Découverte cards, the priority engine's recommendation cards) keeps
// working completely unedited: it just lands in the merged agent's shared
// conversation now instead of a fragment-of-one thread.
//
// Extended with 3 catalog levers that have a benchmarkStatKey (so they CAN
// appear in lib/levers/opportunities.ts's toWatch/strong) but never had
// their own agent to begin with — clicking "Améliorer" on them used to 400
// ("Agent introuvable"). Mapped by thematic proximity: lead_magnet → the
// broad acquisition-strategy agent, newsletter → the same channel as
// regular emailing, webinar → the "vente" agent (its levers_catalog
// category is "vente", it's a sales event).
//
// Single source of truth — app/api/improve-chat/route.ts (resolving which
// agent actually answers) and app/(app)/diagnostic/page.tsx (resolving the
// agent's display name for a lever's advice sentence) both import this
// instead of keeping their own copy.
export const AGENT_KEY_CONSOLIDATION: Record<string, string> = {
  setting: "ceo_vision",
  ads: "ceo_vision",
  closing: "ventes",
  produits: "ventes",
  upsell_ascension: "ventes",
  lead_magnet: "ceo_vision",
  newsletter: "email_marketing",
  webinar: "ventes",
};
