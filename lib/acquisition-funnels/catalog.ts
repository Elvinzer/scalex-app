import type { AcquisitionFunnelCatalogEntry, AcquisitionFunnelStep, AcquisitionFunnelKey } from "./types";

const step = (
  order: number,
  metricKey: string,
  inputMetricKey: string,
  label: string,
  unit: string,
  benchmarkKey: string | null
): AcquisitionFunnelStep => ({ order, metricKey, inputMetricKey, label, unit, benchmarkKey });

// This is the migration seed/fallback only. The product reads the catalogue
// from acquisition_funnels at runtime, so adding a journey or changing its
// labels/steps never requires changing a page component.
export const DEFAULT_ACQUISITION_FUNNELS: AcquisitionFunnelCatalogEntry[] = [
  {
    funnelKey: "lead_magnet",
    label: "Lead magnet",
    description: "Ils téléchargent un PDF ou suivent une formation gratuite.",
    steps: [
      step(1, "audience", "content_views", "Audience", "vues", null),
      step(2, "lead_magnet_clicks", "content_clicks", "Clics lead magnet", "clics", "lead_magnet_click_rate"),
      step(3, "lead_magnet_leads", "content_leads", "Leads (opt-in)", "leads", "lead_magnet_optin_rate"),
      step(4, "booked_calls", "calls_booked", "RDV réservés", "RDV", "lead_magnet_booking_rate"),
      step(5, "attended_calls", "calls_attended", "RDV honorés", "RDV", "lead_magnet_show_up_rate"),
      step(6, "sales_closed", "sales_closed", "Ventes", "ventes", "lead_magnet_closing_rate"),
    ],
  },
  {
    funnelKey: "vsl",
    label: "VSL",
    description: "Ils regardent une vidéo de vente puis réservent.",
    steps: [
      step(1, "audience", "content_views", "Audience", "vues", null),
      step(2, "vsl_clicks", "content_clicks", "Clics VSL", "clics", "vsl_click_rate"),
      step(3, "vsl_views", "vsl_views", "Vues VSL", "spectateurs", "vsl_view_rate"),
      step(4, "booked_calls", "calls_booked", "RDV réservés", "RDV", "vsl_booking_rate"),
      step(5, "attended_calls", "calls_attended", "RDV honorés", "RDV", "vsl_show_up_rate"),
      step(6, "sales_closed", "sales_closed", "Ventes", "ventes", "vsl_closing_rate"),
    ],
  },
  {
    funnelKey: "quiz",
    label: "Quiz",
    description: "Ils font un test et reçoivent un résultat.",
    steps: [
      step(1, "audience", "content_views", "Audience", "vues", null),
      step(2, "quiz_clicks", "quiz_clicks", "Clics quiz", "clics", "quiz_click_rate"),
      step(3, "quiz_completed", "quiz_completed", "Quiz complétés", "quiz", "quiz_completion_rate"),
      step(4, "booked_calls", "calls_booked", "RDV réservés", "RDV", "quiz_booking_rate"),
      step(5, "attended_calls", "calls_attended", "RDV honorés", "RDV", "quiz_show_up_rate"),
      step(6, "sales_closed", "sales_closed", "Ventes", "ventes", "quiz_closing_rate"),
    ],
  },
  {
    funnelKey: "setting_dm",
    label: "DM",
    description: "Tu leur écris ou ils répondent à tes stories.",
    steps: [
      step(1, "new_followers", "new_followers", "Nouveaux abonnés", "abonnés", null),
      step(2, "first_messages", "first_messages", "1ers messages", "messages", "setting_response_rate"),
      step(3, "conversations", "conversations", "Conversations", "conversations", "setting_proposal_rate"),
      step(4, "calls_proposed", "calls_proposed", "Appels proposés", "appels", "setting_booking_rate"),
      step(5, "calls_booked", "calls_booked", "RDV réservés", "RDV", "setting_show_up_rate"),
      step(6, "calls_attended", "calls_attended", "RDV honorés", "RDV", "setting_closing_rate"),
      step(7, "sales_closed", "sales_closed", "Ventes", "ventes", "setting_sales_rate"),
    ],
  },
  {
    funnelKey: "webinaire",
    label: "Webinaire",
    description: "Ils s'inscrivent à un événement puis passent à l'action.",
    steps: [
      step(1, "audience", "content_views", "Audience", "vues", null),
      step(2, "webinar_registrants", "webinar_registrants", "Inscrits", "inscrits", "webinar_registration_rate"),
      step(3, "webinar_attendees", "webinar_attendees", "Présents", "présents", "webinar_attendance_rate"),
      step(4, "booked_calls", "calls_booked", "RDV réservés", "RDV", "webinar_booking_rate"),
      step(5, "attended_calls", "calls_attended", "RDV honorés", "RDV", "webinar_show_up_rate"),
      step(6, "sales_closed", "sales_closed", "Ventes", "ventes", "webinar_closing_rate"),
    ],
  },
  {
    funnelKey: "challenge",
    label: "Challenge",
    description: "Ils s'inscrivent et participent à un challenge.",
    steps: [
      step(1, "audience", "content_views", "Audience", "vues", null),
      step(2, "challenge_registrants", "challenge_registrants", "Inscrits", "inscrits", "challenge_registration_rate"),
      step(3, "challenge_active", "challenge_active", "Participants actifs", "participants", "challenge_participation_rate"),
      step(4, "booked_calls", "calls_booked", "RDV réservés", "RDV", "challenge_booking_rate"),
      step(5, "attended_calls", "calls_attended", "RDV honorés", "RDV", "challenge_show_up_rate"),
      step(6, "sales_closed", "sales_closed", "Ventes", "ventes", "challenge_closing_rate"),
    ],
  },
  {
    funnelKey: "newsletter",
    label: "Newsletter",
    description: "Ils lisent tes emails et cliquent vers ton offre.",
    steps: [
      step(1, "newsletter_subscribers", "newsletter_subscribers", "Abonnés", "abonnés", null),
      step(2, "newsletter_opens", "newsletter_opens", "Ouvertures", "ouvertures", "newsletter_open_rate"),
      step(3, "newsletter_offer_clicks", "newsletter_offer_clicks", "Clics offre", "clics", "newsletter_click_rate"),
      step(4, "booked_calls", "calls_booked", "RDV réservés", "RDV", "newsletter_booking_rate"),
      step(5, "attended_calls", "calls_attended", "RDV honorés", "RDV", "newsletter_show_up_rate"),
      step(6, "sales_closed", "sales_closed", "Ventes", "ventes", "newsletter_closing_rate"),
    ],
  },
  {
    funnelKey: "vente_directe",
    label: "Vente directe",
    description: "Ils arrivent sur ta page de vente et achètent directement.",
    steps: [
      step(1, "audience", "content_views", "Audience", "vues", null),
      step(2, "sales_page_visitors", "sales_page_visitors", "Visiteurs page de vente", "visiteurs", "direct_sales_page_rate"),
      step(3, "checkouts_started", "checkouts_started", "Checkouts initiés", "checkouts", "direct_checkout_rate"),
      step(4, "sales_closed", "sales_closed", "Ventes", "ventes", "direct_purchase_rate"),
    ],
  },
  {
    funnelKey: "communaute",
    label: "Communauté",
    description: "Ils rejoignent ta communauté puis deviennent actifs.",
    steps: [
      step(1, "audience", "content_views", "Audience", "vues", null),
      step(2, "community_joined", "community_joined", "Membres rejoints", "membres", "community_join_rate"),
      step(3, "community_active", "community_active", "Membres actifs", "membres", "community_active_rate"),
      step(4, "booked_calls", "calls_booked", "RDV réservés", "RDV", "community_booking_rate"),
      step(5, "attended_calls", "calls_attended", "RDV honorés", "RDV", "community_show_up_rate"),
      step(6, "sales_closed", "sales_closed", "Ventes", "ventes", "community_closing_rate"),
    ],
  },
];

export const DEFAULT_ACQUISITION_BENCHMARKS: Record<AcquisitionFunnelKey, Record<string, number>> = {
  lead_magnet: { lead_magnet_click_rate: 0.25, lead_magnet_optin_rate: 0.2, lead_magnet_booking_rate: 0.35, lead_magnet_show_up_rate: 0.6, lead_magnet_closing_rate: 0.3 },
  vsl: { vsl_click_rate: 0.35, vsl_view_rate: 0.5, vsl_booking_rate: 0.35, vsl_show_up_rate: 0.6, vsl_closing_rate: 0.3 },
  quiz: { quiz_click_rate: 0.25, quiz_completion_rate: 0.5, quiz_booking_rate: 0.35, quiz_show_up_rate: 0.6, quiz_closing_rate: 0.3 },
  appel_direct: { direct_booking_link_rate: 0.1, direct_booking_rate: 0.35, direct_show_up_rate: 0.6, direct_closing_rate: 0.3 },
  setting_dm: { setting_response_rate: 0.35, setting_proposal_rate: 0.5, setting_booking_rate: 0.35, setting_show_up_rate: 0.6, setting_closing_rate: 0.3, setting_sales_rate: 0.3 },
  webinaire: { webinar_registration_rate: 0.25, webinar_attendance_rate: 0.4, webinar_booking_rate: 0.35, webinar_show_up_rate: 0.6, webinar_closing_rate: 0.3 },
  challenge: { challenge_registration_rate: 0.2, challenge_participation_rate: 0.5, challenge_booking_rate: 0.35, challenge_show_up_rate: 0.6, challenge_closing_rate: 0.3 },
  newsletter: { newsletter_open_rate: 0.4, newsletter_click_rate: 0.05, newsletter_booking_rate: 0.35, newsletter_show_up_rate: 0.6, newsletter_closing_rate: 0.3 },
  vente_directe: { direct_sales_page_rate: 0.3, direct_checkout_rate: 0.15, direct_purchase_rate: 0.3 },
  communaute: { community_join_rate: 0.1, community_active_rate: 0.5, community_booking_rate: 0.35, community_show_up_rate: 0.6, community_closing_rate: 0.3 },
};

export function getDefaultAcquisitionFunnel(key: AcquisitionFunnelKey): AcquisitionFunnelCatalogEntry {
  return DEFAULT_ACQUISITION_FUNNELS.find((entry) => entry.funnelKey === key) ?? DEFAULT_ACQUISITION_FUNNELS[0];
}
