import type { activitySource } from "@/db/schema";

export type ActivitySource = (typeof activitySource.enumValues)[number];

// Shown in the modal's "voici ce qui valide une journée" block (§D). Wording
// is deliberately concrete — the user has to be able to tell, without
// guessing, why yesterday counted and today doesn't yet.
export const ACTIVITY_SOURCE_LABELS: Record<ActivitySource, string> = {
  content_published: "Publier du contenu",
  email_sent: "Envoyer une campagne email",
  business_progress: "Faire avancer ton business",
  checkin_filled: "Remplir tes chiffres",
  lead_worked: "Travailler ton pipeline",
};

export const ACTIVITY_SOURCE_DETAILS: Record<ActivitySource, string> = {
  content_published: "Un post, un Reel, un Short, une story ou une vidéo YouTube — détecté automatiquement à la synchronisation.",
  email_sent: "Une campagne envoyée depuis ton module Newsletter.",
  business_progress: "Une action du Journal cochée, un levier démarré, une amélioration marquée comme faite.",
  checkin_filled: "Une saisie de tes chiffres setting ou closing.",
  lead_worked: "Un commentaire sur un lead ou un lead déplacé dans ton pipeline.",
};

export const ACTIVITY_SOURCE_ORDER: ActivitySource[] = [
  "content_published",
  "email_sent",
  "business_progress",
  "checkin_filled",
  "lead_worked",
];
