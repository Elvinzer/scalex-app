import type { StageKnowledge } from "./types";

// outreachRate = firstMessagesSent / newSubscribers — mesure si les nouveaux
// abonnés reçoivent seulement un premier message, pas s'ils y répondent.
export const outreachRateKnowledge: StageKnowledge = {
  questions: [
    {
      id: "send_timing",
      text: "Le premier message est envoyé...",
      options: [
        { id: "same_day", label: "Le jour même de l'abonnement" },
        { id: "within_48h", label: "Sous 48h" },
        { id: "late_or_never", label: "Plus tard, ou pas systématiquement" },
      ],
    },
    {
      id: "process",
      text: "Ce premier message est envoyé...",
      options: [
        { id: "manual", label: "Manuellement, un par un" },
        { id: "automated", label: "Via une automatisation (DM auto, ManyChat...)" },
      ],
    },
  ],
  rules: [
    {
      id: "late-send",
      when: (answers) => answers.send_timing === "late_or_never",
      cause: "Le délai entre l'abonnement et le premier message est trop long ou irrégulier",
      guidance:
        "Mets en place une routine (ou une automatisation) qui envoie le premier message sous 24h, pendant que l'abonné se souvient encore de ce qui l'a fait suivre le compte.",
    },
    {
      id: "manual-not-scaling",
      when: (answers) => answers.process === "manual" && answers.send_timing !== "same_day",
      cause: "Le process manuel ne suit pas le rythme des nouveaux abonnés",
      guidance:
        "Automatise l'envoi du premier message (garder un ton personnalisé dans le texte), pour ne plus dépendre du temps disponible pour vérifier les nouveaux abonnés.",
    },
  ],
};
