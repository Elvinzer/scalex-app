import type { StageKnowledge } from "./types";

// responseRate = conversationsStarted / firstMessagesSent — le premier
// message part bien, mais ne déclenche pas de réponse.
export const responseRateKnowledge: StageKnowledge = {
  questions: [
    {
      id: "message_format",
      text: "Ton premier message est plutôt...",
      options: [
        { id: "voice", label: "Un vocal" },
        { id: "personalized_text", label: "Un texte personnalisé" },
        { id: "template_text", label: "Un texte identique envoyé à tout le monde" },
      ],
    },
    {
      id: "personal_detail",
      text: "Tu mentionnes un détail spécifique au profil (bio, dernier post) ?",
      options: [
        { id: "yes", label: "Oui, systématiquement" },
        { id: "sometimes", label: "Parfois" },
        { id: "no", label: "Non" },
      ],
    },
  ],
  rules: [
    {
      id: "generic-template",
      when: (answers) => answers.message_format === "template_text",
      cause: "Le message est perçu comme automatisé ou générique",
      guidance:
        "Personnalise au moins les deux premières lignes avec un détail concret du profil (bio, dernier post) — c'est ce qui distingue un message d'un spam aux yeux du destinataire.",
    },
    {
      id: "voice-no-hook",
      when: (answers) => answers.message_format === "voice" && answers.personal_detail === "no",
      cause: "Le vocal, malgré son format plus engageant, manque d'accroche personnalisée",
      guidance:
        "Ouvre le vocal en citant un détail précis du profil dans les 3 premières secondes, avant même de te présenter.",
    },
    {
      id: "no-personalization",
      when: (answers) => answers.personal_detail === "no",
      cause: "Absence de personnalisation quel que soit le format du message",
      guidance:
        "Ajoute un détail spécifique au profil dès la première phrase — c'est souvent le facteur qui détermine si le message est lu jusqu'au bout.",
    },
  ],
};
