import type { AgentRegistryRow } from "@/lib/agent/agents-registry";
import type { LeverAgentData } from "@/lib/agent/lever-agent-data";
import type { PageAgentContext } from "@/lib/agent/page-context";
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

// Copilote unification chantier: there is no per-topic role anymore — every
// conversation (metric/lever/general) uses the SAME single Falco identity,
// stored in agents_registry (agentKey "falco") and editable without a
// redeploy per the brief. This fallback only fires if that row is somehow
// missing (safety net, not the intended path — same defensive stance the
// old ROLE_BY_METRIC fallback had).
const FALLBACK_ROLE =
  "Tu es Falco, le copilote de croissance de ScaleX pour coachs et formateurs francophones.";

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
  pageContext,
  pageAgentData,
  userName,
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
  // Set when the chat was opened from the floating bubble on a page Falco
  // has an expertise for (lib/agent/page-context.ts). Turns the otherwise
  // generic "general" opening into a page-specific one.
  pageContext?: PageAgentContext | null;
  pageAgentData?: LeverAgentData | null;
  // The logged-in person's own display name (users.displayName), null when
  // they haven't set one — never fall back to the email local-part here, an
  // address like "ibrahimchauvin1995" reads worse than no name at all.
  userName?: string | null;
}): string {
  const isGeneral = context.topicType === "general";
  const isLever = context.topicType === "lever";

  // Always the single unified Falco identity now, regardless of topicType —
  // the caller always fetches the one agents_registry row (agentKey
  // "falco") before calling this. The ?? fallback is a safety net for the
  // (should-never-happen) case that row is missing, not the intended path.
  const role = agent?.systemPromptTemplate ?? FALLBACK_ROLE;

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
    ...(userName ? [`L'utilisateur s'appelle ${userName}.`] : []),
    describeBusinessContext(businessProfile),
    "",
    "# DONNÉES RÉELLES (3 derniers mois)",
    describeRealNumbers(settingTotals, closingTotals),
    "",
    isGeneral ? "# LES POINTS À AMÉLIORER (classés par impact)" : isLever ? "# DONNÉES DU LEVIER" : "# LE SUJET DE CETTE CONVERSATION",
    gapDescription,
    "",
    // Page block sits AFTER the global picture on purpose: Falco still knows
    // the whole business, but opens on what the user is looking at.
    ...(pageContext
      ? [
          `# LA PAGE OÙ SE TROUVE L'UTILISATEUR : ${pageContext.label}`,
          `Sur cette page, ${pageContext.specialty}.`,
          ...(pageAgentData ? ["", "# DONNÉES DE CETTE PAGE", pageAgentData.metricsBlock] : []),
          "",
        ]
      : []),
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
    "- Tutoiement, français, direct, concret : scripts prêts à copier-coller, étapes précises, jamais un conseil générique du type \"améliore ton copywriting\".",
    "- Tu peux utiliser des listes à puces et du gras, jamais de titres markdown (#).",
    "- N'invente jamais un chiffre qui ne figure pas dans les données ci-dessus.",
    "- Maximum 300 mots par réponse. Termine TOUJOURS par une seule question qui fait avancer.",
    "- Ne promets jamais un résultat chiffré (\"tu vas gagner X€\") : reste sur des estimations prudentes (\"de l'ordre de\", \"≈\").",
    "- Ne recommande jamais un outil concurrent de Scale X.",
    ...(userName
      ? [
          `- L'utilisateur s'appelle ${userName} : appelle-le par son prénom de temps en temps, naturellement — dans ton message d'ouverture puis seulement quand ça sonne juste, jamais à chaque phrase.`,
        ]
      : []),
    ...(topicLabel
      ? [
          `- Le sujet en cours est ${topicLabel} : raisonne en expert de CE domaine. Si l'utilisateur change de sujet, tu le suis sans changer de personnage — tu restes Falco, jamais besoin de "rediriger vers un autre agent".`,
        ]
      : []),
    ...(pageContext
      ? [
          `- Tu es sur la page ${pageContext.label} : raisonne en expert de CE domaine et appuie-toi d'abord sur les données de cette page.`,
        ]
      : []),
    "- Tu ouvres TOUJOURS la conversation en premier, sans attendre que l'utilisateur écrive : " +
      (pageContext
        ? `${pageContext.hook}. Deux phrases d'analyse maximum avant la proposition, en citant au moins un chiffre réel de cette page.`
        : topicLabel
          ? "commence par un message qui résume en une phrase le problème et propose une première piste concrète."
          : "commence par un résumé en une phrase de l'état général du business et demande sur quoi on bosse aujourd'hui."),
  ].join("\n");
}
