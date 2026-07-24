import type { AgentRegistryRow } from "@/lib/agent/agents-registry";
import type { LeverAgentData } from "@/lib/agent/lever-agent-data";
import type { ClosingTotals } from "@/lib/closing/metrics";
import type { ChatContext } from "@/lib/chat-context";
import type { MetricKey } from "@/lib/diagnostic/benchmarks";
import type { DiagnosticPoint } from "@/lib/diagnostic/cascade";
import type { FollowupCompliance } from "@/lib/diagnostic/followups";
import { formatEur } from "@/lib/currency";
import type { BusinessProfileData } from "@/lib/business/types";
import type { FunnelTotals } from "@/lib/setting/funnel";

export type ImproveMetricKey = MetricKey | "followupRecovery" | "general";

export type LeverMode = "optimiser" | "demarrer" | "decouverte";

const ROLE_BY_METRIC: Record<ImproveMetricKey, string> = {
  responseRate:
    "Tu es un expert en prospection DM et copywriting de premiers messages (setting Instagram/WhatsApp pour infopreneurs francophones).",
  proposalRate:
    "Tu es un expert en conversations de setting : qualification, création de désir, transition naturelle vers la proposition d'appel.",
  bookingRate:
    "Tu es un expert en conversion de propositions d'appel en réservations : urgence, friction de calendrier, messages de confirmation.",
  showUpRate:
    "Tu es un expert en réduction du no-show : séquences de rappel, engagement pré-call, qualité de la qualification.",
  closingRate:
    "Tu es un closer senior spécialisé en vente d'offres high-ticket par téléphone pour coachs et formateurs francophones.",
  followupRecovery:
    "Tu es un expert en séquences de relance : non-acheteurs, paniers abandonnés, paiements échoués.",
  general:
    "Tu es un consultant senior en croissance de business en ligne. Si une question touche une métrique ou un " +
    "levier suivi par l'app, signale-le brièvement et propose d'ouvrir la conversation dédiée à ce sujet pour " +
    "creuser en profondeur — sans jamais forcer, l'utilisateur choisit.",
};

// Exported so lib/call-analysis-prompt-builder.ts and lib/ad-copy-prompt-builder.ts
// can reuse the same business-context description instead of re-deriving it.
export function describeBusinessContext(profile: BusinessProfileData): string {
  const { identity, acquisition, sales, delivery } = profile;
  const lines: string[] = [];

  lines.push(`Niche : ${identity.niche || "non renseignée"}`);
  lines.push(`Avatar client : ${identity.avatarDescription || "non renseigné"}`);
  lines.push(
    `CA actuel : ${identity.mrrCurrent !== null ? formatEur(identity.mrrCurrent) : "non renseigné"}, objectif : ${identity.mrrGoal !== null ? formatEur(identity.mrrGoal) : "non renseigné"}`
  );
  lines.push(`Mode d'acquisition : ${identity.acquisitionMode ?? "non renseigné"}`);

  if (acquisition.platforms.length > 0) {
    lines.push(
      `Plateformes actives : ${acquisition.platforms.map((p) => `${p.name} (${p.postsPerWeek ?? "?"} posts/semaine)`).join(", ")}`
    );
  }
  if (acquisition.leadMagnet.enabled === "yes") {
    lines.push(
      `Lead magnet : ${acquisition.leadMagnet.type ?? "?"} — promesse : ${acquisition.leadMagnet.promise || "non renseignée"}`
    );
  }
  if (acquisition.vsl.enabled === "yes") {
    lines.push(`VSL : oui, ${acquisition.vsl.durationMin ?? "?"} min, CTA : ${acquisition.vsl.cta || "non renseigné"}`);
  }
  if (acquisition.setting.enabled === "yes") {
    lines.push(`Setting : canal ${acquisition.setting.channel || "?"}, opéré par ${acquisition.setting.operator || "?"}`);
  }

  if (sales.offers.length > 0) {
    lines.push(
      "Offres : " +
        sales.offers
          .map(
            (offer) =>
              `${offer.name || "sans nom"} (${offer.price !== null ? formatEur(offer.price) : "prix non renseigné"}, ${offer.type ?? "?"}, vendue via ${offer.saleMode ?? "?"}${offer.isMain ? ", OFFRE PRINCIPALE" : ""})`
          )
          .join(" ; ")
    );
  }
  lines.push(
    `Closing : ${sales.closing.closer ?? "?"}, script ${sales.closing.hasScript === null ? "inconnu" : sales.closing.hasScript ? "oui" : "non"}`
  );
  lines.push(
    `Relances actives : non-acheteurs=${sales.followups.nonBuyers ?? "?"}, no-show=${sales.followups.noShow ?? "?"}, paiements échoués=${sales.followups.failedPayments ?? "?"}`
  );

  lines.push(`Onboarding client : ${delivery.onboardingDescription || "non renseigné"}`);
  lines.push(`Suivi : ${delivery.support.format ?? "?"}, fréquence ${delivery.support.frequency || "non renseignée"}`);
  lines.push(`Témoignages : ${delivery.testimonials.count ?? "?"}, affichés sur ${delivery.testimonials.displayedOn.join(", ") || "nulle part"}`);
  lines.push(`Upsell : ${delivery.upsellOfferId ? "oui" : "non"}`);

  return lines.join("\n");
}

function describeRealNumbers(settingTotals: FunnelTotals, closingTotals: ClosingTotals): string {
  return [
    `Nouveaux abonnés : ${settingTotals.newSubscribers}`,
    `Premiers messages envoyés : ${settingTotals.firstMessagesSent}`,
    `Conversations démarrées : ${settingTotals.conversationsStarted}`,
    `Appels proposés : ${settingTotals.callsProposed}`,
    `Appels réservés : ${settingTotals.callsBooked}`,
    `Appels pris : ${closingTotals.callsAttended}`,
    `Ventes conclues : ${closingTotals.salesClosed}`,
  ].join("\n");
}

function describeAllPoints(points: DiagnosticPoint[]): string {
  if (points.length === 0) {
    return "Tous les taux mesurés sont actuellement au niveau du benchmark — rien de critique à signaler.";
  }
  return points
    .map(
      (p, i) =>
        `${i + 1}. ${p.label} (${p.category}) : ${p.currentRatePercent}% vs benchmark ${p.benchmarkRatePercent}%. ${p.explanation} Manque à gagner : ${p.monthlyGain !== null ? `${formatEur(p.monthlyGain)}/mois` : "non chiffrable"}.`
    )
    .join("\n");
}

const LEVER_MISSION_BY_MODE: Record<LeverMode, string> = {
  optimiser:
    "Aide l'utilisateur à améliorer précisément ce levier, en t'appuyant sur les données ci-dessus (son business " +
    "réel, ses vrais chiffres) — jamais des conseils génériques. Vise à faire progresser son résultat actuel vers " +
    "le benchmark, ou à consolider ce qui marche déjà s'il est déjà au niveau.",
  demarrer:
    "L'utilisateur n'a pas encore ce levier en place. Aide-le à le lancer étape par étape, en référence au plan " +
    "de démarrage déjà affiché sur sa page — des actions concrètes et immédiatement exécutables, jamais de " +
    "conseils théoriques.",
  decouverte:
    "L'utilisateur découvre tout juste ce levier. Aide-le à clarifier où il en est aujourd'hui et donne-lui une " +
    "première action simple pour avancer.",
};

export function buildImprovePrompt({
  context,
  businessProfile,
  settingTotals,
  closingTotals,
  point,
  points,
  followup,
  agent,
  leverAgentData,
  mode,
}: {
  context: ChatContext;
  businessProfile: BusinessProfileData;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  point: DiagnosticPoint | null;
  points?: DiagnosticPoint[];
  followup: FollowupCompliance | null;
  agent?: AgentRegistryRow | null;
  leverAgentData?: LeverAgentData | null;
  mode?: LeverMode | null;
}): string {
  const isGeneral = context.topicType === "general";
  const isLever = context.topicType === "lever";

  // The caller (app/api/improve-chat/route.ts) already rejects the request
  // before reaching this point whenever topicType demands a lever/metric it
  // couldn't resolve — these ?? fallbacks are a safety net, not the
  // intended path, so they stay generic rather than throwing mid-prompt.
  const role = isLever
    ? (agent?.systemPromptTemplate ?? ROLE_BY_METRIC.general)
    : (ROLE_BY_METRIC[context.topicKey as ImproveMetricKey] ?? ROLE_BY_METRIC.general);

  // Never a generic fallback when a specific topic was requested — the
  // caller (app/api/improve-chat/route.ts) already rejects the request
  // before this point if topicType is "metric"/"lever" but the matching
  // point/agent data couldn't be resolved server-side, so `leverAgentData`/
  // `point` being present here is guaranteed whenever topicType demands it.
  const gapDescription = isGeneral
    ? describeAllPoints(points ?? [])
    : isLever && leverAgentData
      ? leverAgentData.metricsBlock
      : point
        ? `Point à améliorer : ${point.label} (${point.category}). Taux actuel : ${point.currentRatePercent}%, benchmark de la niche : ${point.benchmarkRatePercent}%. ${point.explanation} Manque à gagner estimé : ${point.monthlyGain !== null ? `${formatEur(point.monthlyGain)}/mois` : "non chiffrable (pas d'offre principale renseignée)"}.`
        : followup
          ? `Point à améliorer : ${followup.label}. Cette relance n'est pas en place aujourd'hui.`
          : "Point à améliorer : non spécifié.";

  const topicLabel = context.topicLabel ?? "";
  const leverMode: LeverMode = mode ?? "optimiser";

  return [
    "# RÔLE",
    role,
    "",
    "# CONTEXTE BUSINESS DE L'UTILISATEUR",
    describeBusinessContext(businessProfile),
    "",
    "# DONNÉES RÉELLES (3 derniers mois)",
    describeRealNumbers(settingTotals, closingTotals),
    "",
    isGeneral ? "# LES POINTS À AMÉLIORER (classés par impact)" : isLever ? "# DONNÉES DU LEVIER" : "# LE SUJET DE CETTE CONVERSATION",
    gapDescription,
    "",
    "# MISSION",
    isGeneral
      ? "Aide l'utilisateur à comprendre et prioriser ses données, en t'appuyant sur son business réel " +
        "ci-dessus (sa niche, son offre, son prix, ses chiffres) — jamais des conseils génériques. " +
        "Il peut te poser des questions sur n'importe quel chiffre ou point ci-dessus."
      : isLever
        ? LEVER_MISSION_BY_MODE[leverMode]
        : "Aide l'utilisateur à améliorer précisément CE sujet, en t'appuyant sur son business réel " +
          "ci-dessus (sa niche, son offre, son prix, ses chiffres) — jamais des conseils génériques.",
    "",
    "# RÈGLES DE RÉPONSE",
    "- Tutoiement, français, direct, orienté action.",
    "- Tu peux utiliser des listes à puces et du gras, jamais de titres markdown (#).",
    "- N'invente jamais un chiffre qui ne figure pas dans les données ci-dessus.",
    ...(isGeneral
      ? ["- Réponses courtes (3-6 phrases sauf si l'utilisateur demande un script ou une liste détaillée)."]
      : isLever && agent
        ? [
            `- Concret uniquement : donne le texte, le script ou le message prêt à copier-coller, adapté à SON avatar et SES prix — jamais un conseil générique du type "améliore ton copywriting".`,
            "- Maximum 300 mots par réponse. Termine TOUJOURS par une seule question qui fait avancer.",
            `- Ta conversation porte UNIQUEMENT sur ${topicLabel}. Si l'utilisateur pose une question hors sujet, réponds en 2 phrases maximum puis ramène la conversation vers ${topicLabel}. S'il insiste, indique-lui la page compétente sans traiter le fond : "Ça, c'est le rayon de ${agent.name} — tu le trouves sur la page ${topicLabel}."`,
            `- Ne promets jamais un résultat chiffré ("tu vas gagner X€") : reste sur des estimations prudentes ("de l'ordre de", "≈").`,
            "- Ne recommande jamais un outil concurrent de Scale X.",
          ]
        : [
            "- Réponses courtes (3-6 phrases sauf si l'utilisateur demande un script ou une liste détaillée).",
            `- Ta conversation porte sur ${topicLabel}. Chaque réponse doit faire avancer CE sujet : diagnostic, plan, scripts, suivi des résultats.`,
            `- Si l'utilisateur digresse sur un sujet sans rapport : réponds brièvement (2 phrases max) puis ramène la conversation vers le sujet ("Revenons à ton ${topicLabel} — on en était à…").`,
            "- Si l'utilisateur veut explicitement changer de sujet (une autre métrique ou un autre levier) : propose-lui d'ouvrir la conversation dédiée à ce sujet plutôt que de mélanger les deux ici.",
          ]),
    "- Tu ouvres TOUJOURS la conversation en premier, sans attendre que l'utilisateur écrive : " +
      (isGeneral
        ? "commence par un résumé en une phrase de l'état général du business et demande ce qu'il veut creuser."
        : "commence par un message qui résume en une phrase le problème et propose une première piste concrète."),
  ].join("\n");
}
