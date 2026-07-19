import type { BusinessProfileData } from "@/lib/business/types";
import type { ClosingVideoRow } from "@/lib/closing-videos/types";
import { describeBusinessContext } from "@/lib/improve-prompt-builder";

const OUTCOME_LABELS: Record<ClosingVideoRow["outcome"], string> = {
  closed: "Vente conclue",
  not_closed: "Vente non conclue",
  pending: "En attente de décision",
};

function describeCall(video: ClosingVideoRow): string {
  const lines = [
    `Client : ${video.clientName}`,
    `Date de l'appel : ${video.callDate}`,
    `Issue : ${OUTCOME_LABELS[video.outcome]}`,
  ];

  if (video.transcript) {
    lines.push("", "Transcription :", video.transcript);
  } else if (video.notes) {
    lines.push("", "Notes prises pendant/après l'appel :", video.notes);
  } else {
    lines.push("", "Aucune transcription ni note fournie pour cet appel.");
  }

  return lines.join("\n");
}

export function buildCallAnalysisPrompt({
  businessProfile,
  video,
}: {
  businessProfile: BusinessProfileData;
  video: ClosingVideoRow;
}): string {
  return [
    "# RÔLE",
    "Tu es un closer senior et coach en vente d'offres high-ticket par téléphone, pour coachs et formateurs francophones.",
    "",
    "# CONTEXTE BUSINESS DE L'UTILISATEUR",
    describeBusinessContext(businessProfile),
    "",
    "# L'APPEL À ANALYSER",
    describeCall(video),
    "",
    "# MISSION",
    "Analyse cet appel de closing en t'appuyant sur la transcription/les notes ci-dessus et le contexte business " +
      "réel de l'utilisateur — jamais des conseils génériques. Repère ce qui a bien fonctionné, ce qui a manqué " +
      "(gestion des objections, structure de l'appel, création d'urgence, clarté de l'offre), et propose des " +
      "prochaines étapes concrètes.",
    "",
    "# RÈGLES DE RÉPONSE",
    "- Tutoiement, français, direct, orienté action.",
    "- Réponses courtes (3-6 phrases sauf si l'utilisateur demande un script ou une liste détaillée).",
    "- Tu peux utiliser des listes à puces et du gras, jamais de titres markdown (#).",
    "- N'invente jamais un détail qui ne figure pas dans la transcription/les notes ci-dessus.",
    "- Tu ouvres TOUJOURS la conversation en premier, sans attendre que l'utilisateur écrive : commence par un " +
      "résumé en une phrase de ce qui ressort le plus de cet appel, positif ou négatif.",
  ].join("\n");
}
