import type { StageKnowledge } from "./types";

// showUpRate — l'appel est réservé mais le prospect ne se présente pas
// (no-show).
export const showUpRateKnowledge: StageKnowledge = {
  questions: [
    {
      id: "reminder",
      text: "Tu envoies un rappel avant l'appel ?",
      options: [
        { id: "none", label: "Aucun rappel" },
        { id: "day_before", label: "Un rappel la veille" },
        { id: "day_before_and_day_of", label: "Un rappel la veille + le jour même" },
      ],
    },
    {
      id: "prior_commitment",
      text: "Le prospect s'engage à quelque chose avant l'appel (acompte, questionnaire à remplir) ?",
      options: [
        { id: "yes", label: "Oui" },
        { id: "no", label: "Non, juste la réservation du créneau" },
      ],
    },
  ],
  rules: [
    {
      id: "no-reminder",
      when: (answers) => answers.reminder === "none",
      cause: "L'absence de rappel avant l'appel laisse le prospect oublier ou déprioriser le rendez-vous",
      guidance:
        "Mets en place un rappel automatique la veille et le jour même de l'appel — c'est souvent le levier le plus direct sur le no-show.",
    },
    {
      id: "reminder-day-before-only",
      when: (answers) => answers.reminder === "day_before",
      cause: "Le rappel de la veille seul laisse une fenêtre d'oubli le jour même",
      guidance:
        "Ajoute un second rappel le jour même de l'appel, en plus de celui de la veille.",
    },
    {
      id: "no-prior-engagement",
      when: (answers) => answers.prior_commitment === "no",
      cause: "Le prospect n'a rien engagé avant l'appel, ce qui réduit sa motivation à s'y présenter",
      guidance:
        "Ajoute une étape d'engagement avant l'appel (questionnaire de qualification à remplir, ou acompte symbolique) pour augmenter la valeur perçue du rendez-vous.",
    },
  ],
};
