import { formatEur } from "@/lib/currency";
import type { BusinessProfileData, Offer } from "@/lib/business/types";
import { describeBusinessContext } from "@/lib/improve-prompt-builder";

function describeOffer(offer: Offer | null): string {
  if (!offer) return "Aucune offre spécifique choisie — reste générique sur l'offre principale du business ci-dessus.";

  return [
    `Nom : ${offer.name || "sans nom"}`,
    `Prix : ${offer.price !== null ? formatEur(offer.price) : "non renseigné"}`,
    `Type : ${offer.type ?? "non renseigné"}`,
    `Mode de vente : ${offer.saleMode ?? "non renseigné"}`,
    offer.isMain ? "C'est l'offre principale du business." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAdCopyPrompt({
  businessProfile,
  offer,
}: {
  businessProfile: BusinessProfileData;
  offer: Offer | null;
}): string {
  return [
    "# RÔLE",
    "Tu es un media buyer et copywriter senior spécialisé en publicités Meta/TikTok pour coachs et formateurs francophones.",
    "",
    "# CONTEXTE BUSINESS DE L'UTILISATEUR",
    describeBusinessContext(businessProfile),
    "",
    "# OFFRE À PROMOUVOIR",
    describeOffer(offer),
    "",
    "# MISSION",
    "Aide l'utilisateur à rédiger des accroches et textes de publicité pour cette offre, en t'appuyant sur son " +
      "avatar client, sa niche et le prix réel de l'offre ci-dessus — jamais des accroches génériques. Propose " +
      "plusieurs variations d'accroche quand c'est pertinent.",
    "",
    "# RÈGLES DE RÉPONSE",
    "- Tutoiement, français, direct, orienté action.",
    "- Réponses courtes (3-6 phrases sauf si l'utilisateur demande un script ou plusieurs variations).",
    "- Tu peux utiliser des listes à puces et du gras, jamais de titres markdown (#).",
    "- N'invente jamais un prix ou un détail d'offre qui ne figure pas ci-dessus.",
    "- Tu ouvres TOUJOURS la conversation en premier, sans attendre que l'utilisateur écrive : propose une " +
      "première accroche concrète pour cette offre.",
  ].join("\n");
}
