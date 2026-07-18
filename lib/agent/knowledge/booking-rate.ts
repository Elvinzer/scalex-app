import type { StageKnowledge } from "./types";

// bookingRate = callsBooked / callsProposed — l'appel est proposé mais pas
// réservé.
export const bookingRateKnowledge: StageKnowledge = {
  questions: [
    {
      id: "booking_method",
      text: "Comment le prospect réserve l'appel ?",
      options: [
        { id: "direct_calendar_link", label: "Lien de calendrier direct (Calendly...)" },
        { id: "reply_then_link", label: "Il répond d'abord, puis tu envoies le lien" },
        { id: "manual_slot", label: "Tu lui proposes un créneau manuellement" },
      ],
    },
    {
      id: "follow_up",
      text: "Tu relances si pas de réservation sous 24-48h ?",
      options: [
        { id: "yes", label: "Oui" },
        { id: "no", label: "Non" },
      ],
    },
  ],
  rules: [
    {
      id: "manual-slot-friction",
      when: (answers) => answers.booking_method === "manual_slot",
      cause: "Le choix manuel de créneau ajoute des allers-retours qui font perdre des prospects",
      guidance:
        "Utilise un lien de calendrier direct (type Calendly) pour que le prospect réserve en un clic, sans attendre ta disponibilité.",
    },
    {
      id: "reply-then-link-friction",
      when: (answers) => answers.booking_method === "reply_then_link",
      cause: "L'étape intermédiaire (attendre une réponse avant d'envoyer le lien) perd des prospects en route",
      guidance:
        "Envoie directement le lien de réservation dans le message qui propose l'appel, plutôt que d'attendre une confirmation d'intérêt.",
    },
    {
      id: "no-follow-up",
      when: (answers) => answers.follow_up === "no",
      cause: "L'absence de relance laisse filer les prospects qui n'ont pas réservé tout de suite",
      guidance:
        "Mets en place une relance systématique sous 24-48h pour les prospects à qui l'appel a été proposé mais qui n'ont pas encore réservé.",
    },
  ],
};
