import type { FunnelBlockCatalogEntry, FunnelBlockStep } from "./types";

function step(
  order: number,
  metricKey: string,
  label: string,
  unit: string,
  benchmarkKey: string | null
): FunnelBlockStep {
  return { order, metricKey, label, unit, benchmarkKey };
}

function block(
  blockKey: string,
  family: FunnelBlockCatalogEntry["family"],
  label: string,
  description: string,
  steps: FunnelBlockStep[],
  example: string
): FunnelBlockCatalogEntry {
  return { blockKey, family, label, description, steps, example };
}

// Seed data only. The application reads funnel_blocks at runtime, so the
// catalogue can be edited by an admin without changing a page component.
export const DEFAULT_FUNNEL_BLOCKS: FunnelBlockCatalogEntry[] = [
  block("organique", "source", "Organique", "Le trafic qui vient de tes contenus et recommandations.", [], "Contenu → capture"),
  block("ads", "source", "Ads", "Le trafic acheté sur Meta, YouTube ou une autre régie.", [], "Ads → VSL"),
  block("newsletter", "source", "Newsletter", "Le trafic que tu possèdes déjà dans ta liste email.", [], "Email → offre"),
  block("bouche_a_oreille", "source", "Bouche-à-oreille", "Les prospects qui arrivent grâce à une recommandation.", [], "Recommandation → appel"),
  block("communaute_externe", "source", "Communauté externe", "Le trafic qui vient d'une communauté que tu ne possèdes pas.", [], "Communauté → capture"),

  block(
    "lead_magnet",
    "capture",
    "Lead magnet",
    "Le prospect échange son email contre une ressource gratuite.",
    [step(1, "lead_magnet_clicks", "Clics", "clics", null), step(2, "lead_magnet_optins", "Opt-ins", "opt-ins", "optin_rate")],
    "Clics → Opt-ins"
  ),
  block(
    "vsl",
    "capture",
    "VSL",
    "Le prospect regarde une vidéo de vente avant de continuer.",
    [step(1, "vsl_views", "Vues", "vues", null), step(2, "vsl_complete_views", "Vues complètes", "vues", "complete_view_rate")],
    "Vues → Vues complètes"
  ),
  block(
    "quiz",
    "capture",
    "Quiz",
    "Le prospect répond à un quiz et reçoit un résultat.",
    [step(1, "quiz_clicks", "Clics", "clics", null), step(2, "quiz_completed", "Quiz complétés", "quiz", "completion_rate")],
    "Clics → Quiz complétés"
  ),
  block(
    "page_de_vente",
    "capture",
    "Page de vente",
    "Le prospect découvre ton offre sur une page dédiée.",
    [step(1, "sales_page_visitors", "Visiteurs", "visiteurs", null), step(2, "checkouts_started", "Checkouts initiés", "checkouts", "checkout_rate")],
    "Visiteurs → Checkouts"
  ),
  block(
    "inscription_event",
    "capture",
    "Inscription événement",
    "Le prospect s'inscrit à un webinaire, challenge ou événement.",
    [step(1, "event_registrants", "Inscrits", "inscrits", null)],
    "Inscrits → événement"
  ),
  block("aucune_capture", "capture", "Aucune capture", "Le prospect va directement vers la conversion.", [], "Direct → conversion"),

  block(
    "communaute_freemium",
    "nurturing",
    "Communauté freemium",
    "Le prospect rejoint une communauté puis devient actif.",
    [step(1, "community_joined", "Membres rejoints", "membres", null), step(2, "community_active", "Membres actifs", "membres", "active_rate")],
    "Membres rejoints → Membres actifs"
  ),
  block(
    "sequence_email",
    "nurturing",
    "Séquence email",
    "Une séquence email accompagne le prospect jusqu'à l'offre.",
    [step(1, "email_sends", "Envois", "emails", null), step(2, "email_opens", "Ouvertures", "ouvertures", "open_rate"), step(3, "email_clicks", "Clics", "clics", "click_rate")],
    "Envois → Ouvertures → Clics"
  ),
  block(
    "challenge",
    "nurturing",
    "Challenge",
    "Le prospect participe à un challenge avant de passer à l'action.",
    [step(1, "challenge_participants", "Participants", "participants", null), step(2, "challenge_active", "Participants actifs", "participants", "active_rate")],
    "Participants → Participants actifs"
  ),
  block("webinaire", "nurturing", "Webinaire", "Le prospect assiste à un webinaire avant la conversion.", [step(1, "webinar_attendees", "Présents", "présents", null)], "Inscrits → Présents"),
  block(
    "setting_dm",
    "nurturing",
    "Setting DM",
    "Les échanges en DM qualifient le prospect et proposent un appel.",
    [step(1, "first_messages", "Premiers messages", "messages", null), step(2, "conversations", "Conversations", "conversations", "conversation_rate"), step(3, "calls_proposed", "Appels proposés", "appels", "proposal_rate")],
    "Messages → Conversations → Appels proposés"
  ),
  block("aucune_nurturing", "nurturing", "Aucun nurturing", "Il n'y a pas d'étape intermédiaire avant la vente.", [], "Direct → conversion"),

  block(
    "appel",
    "conversion",
    "Appel",
    "La vente se fait pendant un appel de closing.",
    [step(1, "calls_booked", "RDV réservés", "RDV", null), step(2, "calls_attended", "RDV honorés", "RDV", "show_up_rate"), step(3, "sales_closed", "Ventes", "ventes", "closing_rate")],
    "RDV réservés → RDV honorés → Ventes"
  ),
  block(
    "checkout_direct",
    "conversion",
    "Checkout direct",
    "Le prospect achète directement depuis un checkout.",
    [step(1, "checkouts_started", "Checkouts", "checkouts", null), step(2, "sales_closed", "Ventes", "ventes", "purchase_rate")],
    "Checkouts → Ventes"
  ),
  block(
    "offre_fin_event",
    "conversion",
    "Offre en fin d'événement",
    "Une offre est présentée à la fin d'un événement.",
    [step(1, "offers_presented", "Offres présentées", "offres", null), step(2, "sales_closed", "Ventes", "ventes", "closing_rate")],
    "Offres présentées → Ventes"
  ),
];

export const DEFAULT_FUNNEL_BLOCK_BENCHMARKS: Record<string, Record<string, number>> = {
  lead_magnet: { optin_rate: 0.2 },
  vsl: { complete_view_rate: 0.5 },
  quiz: { completion_rate: 0.5 },
  page_de_vente: { checkout_rate: 0.15 },
  communaute_freemium: { active_rate: 0.5 },
  sequence_email: { open_rate: 0.4, click_rate: 0.05 },
  challenge: { active_rate: 0.5 },
  setting_dm: { conversation_rate: 0.35, proposal_rate: 0.5 },
  appel: { show_up_rate: 0.6, closing_rate: 0.3 },
  checkout_direct: { purchase_rate: 0.3 },
  offre_fin_event: { closing_rate: 0.3 },
};

export function getDefaultFunnelBlock(blockKey: string): FunnelBlockCatalogEntry | undefined {
  return DEFAULT_FUNNEL_BLOCKS.find((entry) => entry.blockKey === blockKey);
}
