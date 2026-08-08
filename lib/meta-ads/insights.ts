import { createHash } from "node:crypto";

import { upsertMaterializedInsight, type MaterializedInsight } from "@/lib/insight-execution/source-adapters";

import type { MetaCampaignType, MetaInsightSnapshot, MetaProvenance } from "./types";
import { metricValue, type MetaAdsDashboard, type MetaCampaignDashboardRow } from "./queries";
import { META_INSIGHT_THRESHOLDS } from "./thresholds";

export { META_INSIGHT_THRESHOLDS } from "./thresholds";

export type MetaInsightRuleKey =
  | "vsl_hook_ok_retention_faible"
  | "vsl_ctr_ok_landing_faible"
  | "vsl_leads_ok_cash_baisse"
  | "web_inscription_ok_showup_bas"
  | "web_trafic_qualifie"
  | "ig_visites_ok_follow_bas"
  | "ig_follows_moins_engages"
  | "rt_saturation"
  | "rt_exclusion_manquante"
  | "rt_fenetre_inefficace";

export const META_INSIGHT_RULE_CATALOG = [
  { key: "vsl_hook_ok_retention_faible", campaignType: "vsl", requiredSource: "Meta Ads · vidéo" },
  { key: "vsl_ctr_ok_landing_faible", campaignType: "vsl", requiredSource: "Meta Ads · landing page" },
  { key: "vsl_leads_ok_cash_baisse", campaignType: "vsl", requiredSource: "Meta Ads + Stripe · touchpoint" },
  { key: "web_inscription_ok_showup_bas", campaignType: "webinar", requiredSource: "Meta Ads + webinar" },
  { key: "web_trafic_qualifie", campaignType: "webinar", requiredSource: "Meta Ads + webinar + ventes" },
  { key: "ig_visites_ok_follow_bas", campaignType: "instagram_profile_growth", requiredSource: "Meta Ads + Instagram" },
  { key: "ig_follows_moins_engages", campaignType: "instagram_profile_growth", requiredSource: "Meta Ads + Instagram" },
  { key: "rt_saturation", campaignType: "retargeting", requiredSource: "Meta Ads · historique" },
  { key: "rt_exclusion_manquante", campaignType: "retargeting", requiredSource: "Meta Ads · audiences" },
  { key: "rt_fenetre_inefficace", campaignType: "retargeting", requiredSource: "Meta Ads · fenêtres" },
] as const;

export type MetaInsightProposal = {
  campaignId: string;
  campaignName: string;
  campaignType: MetaCampaignType;
  ruleKey: MetaInsightRuleKey;
  title: string;
  insightText: string;
  metricKey: string;
  currentValue: number | null;
  comparisonValue: number | null;
  sampleSize: number;
  provenance: MetaProvenance;
  priority: "high" | "medium" | "low";
  evidence: string;
  diagnosis: string;
  recommendedAction: string;
  expectedImpact: string;
  successCriterion: string;
  confidence: "high" | "medium" | "low";
  sourceCoverage: string;
};

const MIN_IMPRESSIONS = META_INSIGHT_THRESHOLDS.minImpressions;
const MIN_CLICKS = META_INSIGHT_THRESHOLDS.minClicks;
const MIN_PROFILE_VISITS = META_INSIGHT_THRESHOLDS.minProfileVisits;
const MIN_COVERAGE = META_INSIGHT_THRESHOLDS.minCoverage;
const VSL_HOLD_RATE_THRESHOLD = META_INSIGHT_THRESHOLDS.vslHoldRate;
const VSL_LANDING_TO_LEAD_THRESHOLD = META_INSIGHT_THRESHOLDS.vslLandingToLeadRate;
const VSL_CPL_STABILITY_THRESHOLD = META_INSIGHT_THRESHOLDS.vslCplStability;
const VSL_CASH_PER_LEAD_DECLINE_THRESHOLD = META_INSIGHT_THRESHOLDS.vslCashPerLeadDecline;
const IG_FOLLOW_RATE_THRESHOLD = META_INSIGHT_THRESHOLDS.igFollowRate;
const IG_COST_PER_VISIT_IMPROVEMENT_THRESHOLD = META_INSIGHT_THRESHOLDS.igCostPerVisitImprovement;
const IG_FOLLOWS_GROWTH_THRESHOLD = META_INSIGHT_THRESHOLDS.igFollowsGrowth;
const IG_ENGAGEMENT_DECLINE_THRESHOLD = META_INSIGHT_THRESHOLDS.igEngagementDecline;
const RETARGETING_FREQUENCY_INCREASE_THRESHOLD = META_INSIGHT_THRESHOLDS.retargetingFrequencyIncrease;
const RETARGETING_CTR_DECLINE_THRESHOLD = META_INSIGHT_THRESHOLDS.retargetingCtrDecline;
const RETARGETING_CPA_INCREASE_THRESHOLD = META_INSIGHT_THRESHOLDS.retargetingCpaIncrease;
const RT_WINDOW_CPA_RATIO = META_INSIGHT_THRESHOLDS.retargetingWindowCpaRatio;
const RT_MIN_WINDOW_LEADS = META_INSIGHT_THRESHOLDS.retargetingMinWindowLeads;

function successCriterionFor(ruleKey: MetaInsightRuleKey): string {
  switch (ruleKey) {
    case "vsl_hook_ok_retention_faible":
      return `Sur la prochaine période comparable, remonter le hold rate au-dessus de ${Math.round(VSL_HOLD_RATE_THRESHOLD * 100)} % sans faire baisser le hook rate.`;
    case "vsl_ctr_ok_landing_faible":
      return `Sur la prochaine période comparable, remonter le taux landing → lead au-dessus de ${Math.round(VSL_LANDING_TO_LEAD_THRESHOLD * 100)} % avec un CTR lien au moins stable.`;
    case "vsl_leads_ok_cash_baisse":
      return `Sur la prochaine période comparable, stabiliser ou remonter le cash par lead sans augmenter le CPL de plus de ${Math.round(VSL_CPL_STABILITY_THRESHOLD * 100)} %.`;
    case "web_inscription_ok_showup_bas":
      return "Sur la prochaine période comparable, stabiliser le coût par inscription et remonter le taux de présence live mesuré.";
    case "web_trafic_qualifie":
      return "Sur la prochaine période comparable, réduire le coût par participant sans dégrader la qualité post-webinar mesurée.";
    case "ig_visites_ok_follow_bas":
      return `Sur la prochaine période comparable, dépasser ${Math.round(IG_FOLLOW_RATE_THRESHOLD * 100)} % de conversion visite → follow sans dégrader le coût par visite.`;
    case "ig_follows_moins_engages":
      return `Sur la prochaine période comparable, conserver la progression des follows (au moins +${Math.round(IG_FOLLOWS_GROWTH_THRESHOLD * 100)} %) tout en stabilisant ou remontant l’engagement par follower.`;
    case "rt_saturation":
      return `Sur la prochaine période comparable, réduire la fréquence d’au moins ${Math.round(RETARGETING_FREQUENCY_INCREASE_THRESHOLD * 100)} % et remonter le CTR sans augmenter le CPA.`;
    case "rt_exclusion_manquante":
      return "Après vérification dans Meta Ads, aucune audience active ne doit inclure des acheteurs sans exclusion explicite.";
    case "rt_fenetre_inefficace":
      return `Sur la prochaine période comparable, ramener le CPA de la fenêtre inefficace sous ${RT_WINDOW_CPA_RATIO.toFixed(1)}× celui de la meilleure fenêtre, ou la désactiver après contrôle du volume.`;
  }
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
}

function provenance(source: MetaProvenance["source"] = "meta", attribution: MetaProvenance["attribution"] = "directe"): MetaProvenance {
  return {
    source,
    calculation: "derivee",
    attribution,
    freshness: new Date().toISOString(),
  };
}

export function metaInsightFingerprint(accountId: string, proposal: MetaInsightProposal, periodStart: string, periodEnd: string): string {
  return createHash("sha256")
    .update(`${accountId}:${proposal.campaignId}:${proposal.campaignType}:${proposal.ruleKey}:${proposal.metricKey}:${periodStart}:${periodEnd}`)
    .digest("hex");
}

function baseProposal(
  campaign: MetaCampaignDashboardRow,
  ruleKey: MetaInsightRuleKey,
  title: string,
  insightText: string,
  metricKey: string,
  currentValue: number | null,
  comparisonValue: number | null,
  sampleSize: number,
  details: {
    priority: "high" | "medium" | "low";
    evidence: string;
    diagnosis: string;
    recommendedAction: string;
    expectedImpact: string;
    confidence: "high" | "medium" | "low";
    sourceCoverage: string;
    provenance?: MetaProvenance;
  },
): MetaInsightProposal {
  const metaCoverage = campaign.metricCoverageRate == null
    ? "Meta Ads : couverture métrique indisponible"
    : `Meta Ads : ${Math.round(campaign.metricCoverageRate * 100)} % des jours de la période`;
  const sourceNotes = [metaCoverage];
  if (details.sourceCoverage.includes("Stripe")) {
    sourceNotes.push(
      campaign.cash?.coverageRate == null
        ? "Stripe : couverture des ventes indisponible"
        : `Stripe : ${Math.round(campaign.cash.coverageRate * 100)} % des ventes de la période rattachées`,
    );
  }
  if (details.sourceCoverage.includes("Instagram")) {
    sourceNotes.push(`Instagram : observation ${campaign.instagramObservation?.connected ? "connectée" : "indisponible"}, follows non attribués`);
  }
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    campaignType: campaign.campaignType,
    ruleKey,
    title,
    insightText,
    metricKey,
    currentValue,
    comparisonValue,
    sampleSize,
    provenance: details.provenance ?? provenance(),
    ...details,
    successCriterion: successCriterionFor(ruleKey),
    sourceCoverage: `${details.sourceCoverage} · ${sourceNotes.join(" · ")}`,
  };
}

function buildCampaignProposals(campaign: MetaCampaignDashboardRow): MetaInsightProposal[] {
  const metrics = campaign.metrics;
  if (campaign.metricCoverageRate === null || campaign.metricCoverageRate === undefined || campaign.metricCoverageRate < MIN_COVERAGE) return [];
  const impressions = metricValue(metrics, "impressions");
  if (impressions === null || impressions < MIN_IMPRESSIONS) return [];
  const proposals: MetaInsightProposal[] = [];

  if (campaign.campaignType === "vsl") {
    const hookRate = ratio(metricValue(metrics, "video3sViews"), impressions);
    const holdRate = ratio(metricValue(metrics, "videoThruplay"), metricValue(metrics, "video3sViews"));
    const comparison = campaign.comparisonMetrics;
    const comparisonImpressions = metricValue(comparison, "impressions");
    const comparisonHookRate = ratio(metricValue(comparison, "video3sViews"), comparisonImpressions);
    if (hookRate !== null && holdRate !== null && comparisonHookRate !== null && hookRate >= comparisonHookRate && holdRate < VSL_HOLD_RATE_THRESHOLD && metricValue(metrics, "video3sViews") !== null) {
      proposals.push(
        baseProposal(
          campaign,
          "vsl_hook_ok_retention_faible",
          "L’accroche VSL attire, mais la rétention décroche",
          `La campagne « ${campaign.name} » a un hook rate de ${Math.round(hookRate * 100)}% contre ${Math.round(comparisonHookRate * 100)}% sur la période précédente, mais seulement ${Math.round(holdRate * 100)}% des vues de 3 secondes atteignent le ThruPlay. Le prochain test doit travailler la promesse et le rythme des premières secondes avant d’augmenter le budget.`,
          "video_hold_rate",
          holdRate,
          comparisonHookRate,
          metricValue(metrics, "video3sViews") ?? 0,
          {
            priority: "high",
            evidence: `Hook rate ${Math.round(comparisonHookRate * 100)} % → ${Math.round(hookRate * 100)} % · hold rate ${Math.round(holdRate * 100)} % · seuil de rétention ${Math.round(VSL_HOLD_RATE_THRESHOLD * 100)} % · ${metrics.video3sViews} vues de 3 secondes.`,
            diagnosis: "L’accroche obtient l’attention initiale, mais la promesse ou le rythme ne retient pas assez longtemps.",
            recommendedAction: "Tester une nouvelle promesse et un montage plus direct sur les premières secondes avant d’augmenter le budget.",
            expectedImpact: "Augmenter la rétention vidéo et la part de trafic qui poursuit le parcours VSL.",
            confidence: "medium",
            sourceCoverage: "Meta Ads · Insights vidéo · campagne · 30 derniers jours",
          },
        ),
      );
    }
    const linkClicks = metricValue(metrics, "linkClicks");
    const ctr = ratio(linkClicks, impressions);
    const comparisonCtr = ratio(metricValue(campaign.comparisonMetrics, "linkClicks"), metricValue(campaign.comparisonMetrics, "impressions"));
    const landingToLeadRate = ratio(metricValue(metrics, "leads"), metricValue(metrics, "landingPageViews"));
    const landingPageViews = metricValue(metrics, "landingPageViews");
    if (ctr !== null && comparisonCtr !== null && landingToLeadRate !== null && ctr >= comparisonCtr && landingToLeadRate < VSL_LANDING_TO_LEAD_THRESHOLD && linkClicks !== null && linkClicks >= MIN_CLICKS && landingPageViews !== null && landingPageViews >= MIN_CLICKS) {
      proposals.push(
        baseProposal(
          campaign,
          "vsl_ctr_ok_landing_faible",
          "Le CTR est solide, mais la landing page perd une partie du trafic",
          `Le CTR lien de « ${campaign.name} » passe de ${Math.round(comparisonCtr * 10000) / 100}% à ${Math.round(ctr * 10000) / 100}%, mais seulement ${Math.round(landingToLeadRate * 100)}% des vues de landing deviennent des leads. Vérifie le chargement, le formulaire et le tracking avant de modifier la créa.`,
          "landing_to_lead_rate",
          landingToLeadRate,
          comparisonCtr,
          linkClicks,
          {
            priority: "high",
            evidence: `CTR lien ${Math.round(comparisonCtr * 10000) / 100} % → ${Math.round(ctr * 10000) / 100} % · landing → lead ${Math.round(landingToLeadRate * 100)} % · seuil ${Math.round(VSL_LANDING_TO_LEAD_THRESHOLD * 100)} % · ${metrics.linkClicks} clics, ${landingPageViews} vues landing.`,
            diagnosis: "Le trafic arrive sur la landing, mais la page ou le formulaire transforme peu de ces visites en leads.",
            recommendedAction: "Vérifier vitesse, redirections, friction du formulaire, consentement et présence du tracking sur la landing page.",
            expectedImpact: "Récupérer des leads à partir du trafic déjà acheté avant de modifier la créa.",
            confidence: "medium",
            sourceCoverage: "Meta Ads · clics, landing page views et leads · campagne · 30 derniers jours",
          },
        ),
      );
    }

    const currentLeads = metricValue(metrics, "leads");
    const comparisonLeads = metricValue(campaign.comparisonMetrics, "leads");
    const currentSpend = metricValue(metrics, "spendCents");
    const comparisonSpend = metricValue(campaign.comparisonMetrics, "spendCents");
    const currentCpl = currentLeads !== null && currentLeads > 0 && currentSpend !== null ? currentSpend / currentLeads : null;
    const comparisonCpl = comparisonLeads !== null && comparisonLeads > 0 && comparisonSpend !== null ? comparisonSpend / comparisonLeads : null;
    const currentCashPerLead = campaign.cash?.available && campaign.cash.revenueCents !== null && currentLeads !== null && currentLeads > 0 ? campaign.cash.revenueCents / currentLeads : null;
    const comparisonCashPerLead = campaign.cash?.comparisonAvailable && campaign.cash.comparisonRevenueCents !== null && comparisonLeads !== null && comparisonLeads > 0 ? campaign.cash.comparisonRevenueCents / comparisonLeads : null;
    if (currentCpl !== null && comparisonCpl !== null && currentCashPerLead !== null && comparisonCashPerLead !== null && Math.abs(currentCpl - comparisonCpl) / comparisonCpl <= VSL_CPL_STABILITY_THRESHOLD && currentCashPerLead < comparisonCashPerLead * (1 - VSL_CASH_PER_LEAD_DECLINE_THRESHOLD)) {
      proposals.push(
        baseProposal(
          campaign,
          "vsl_leads_ok_cash_baisse",
          "Le volume de leads tient, mais le cash par lead baisse",
          `Le CPL de « ${campaign.name} » reste proche de la période précédente (${(comparisonCpl / 100).toFixed(2)} € → ${(currentCpl / 100).toFixed(2)} €), alors que le cash par lead passe de ${(comparisonCashPerLead / 100).toFixed(2)} € à ${(currentCashPerLead / 100).toFixed(2)} €.`,
          "cash_per_lead",
          currentCashPerLead,
          comparisonCashPerLead,
          currentLeads ?? 0,
          {
            priority: "high",
            evidence: `CPL ${(comparisonCpl / 100).toFixed(2)} € → ${(currentCpl / 100).toFixed(2)} € · variation CPL ≤ ${Math.round(VSL_CPL_STABILITY_THRESHOLD * 100)} % · cash/lead ${(comparisonCashPerLead / 100).toFixed(2)} € → ${(currentCashPerLead / 100).toFixed(2)} € · baisse détectée ≥ ${Math.round(VSL_CASH_PER_LEAD_DECLINE_THRESHOLD * 100)} % · couverture cash ${(campaign.cash?.coverageRate === null || campaign.cash?.coverageRate === undefined ? "—" : `${Math.round(campaign.cash.coverageRate * 100)} %`)}.`,
            diagnosis: "Le coût d’acquisition ne bouge pas fortement, mais les leads issus de la campagne génèrent moins de cash rattaché.",
            recommendedAction: "Vérifier la qualité des leads, l’offre présentée après le VSL et la continuité du suivi jusqu’au closing.",
            expectedImpact: "Protéger le cash par lead sans couper une campagne uniquement sur son CPL.",
            confidence: "medium",
            sourceCoverage: "Meta Ads + Stripe · touchpoints Scale X · couverture suffisante sur les deux périodes",
            provenance: provenance("meta+stripe", "jointe"),
          },
        ),
      );
    }
  }

  if (campaign.campaignType === "instagram_profile_growth") {
    const profileVisits = metricValue(metrics, "profileVisits");
    const observation = campaign.instagramObservation;
    const follows = observation?.current.follows ?? null;
    const followRate = ratio(follows, profileVisits);
    const currentSpend = metricValue(metrics, "spendCents");
    const comparisonSpend = metricValue(campaign.comparisonMetrics, "spendCents");
    const comparisonProfileVisits = metricValue(campaign.comparisonMetrics, "profileVisits");
    const currentCostPerVisit = currentSpend !== null && profileVisits !== null && profileVisits > 0 ? currentSpend / profileVisits : null;
    const comparisonCostPerVisit = comparisonSpend !== null && comparisonProfileVisits !== null && comparisonProfileVisits > 0 ? comparisonSpend / comparisonProfileVisits : null;
    if (observation?.connected && followRate !== null && profileVisits !== null && follows !== null && profileVisits >= MIN_PROFILE_VISITS && currentCostPerVisit !== null && comparisonCostPerVisit !== null && currentCostPerVisit < comparisonCostPerVisit * (1 - IG_COST_PER_VISIT_IMPROVEMENT_THRESHOLD) && followRate < IG_FOLLOW_RATE_THRESHOLD) {
      proposals.push(
        baseProposal(
          campaign,
          "ig_visites_ok_follow_bas",
          "Les visites de profil ne se transforment pas assez en abonnements",
          `Le coût par visite du profil de « ${campaign.name} » baisse, mais ${follows} follow(s) seulement sont observés dans Instagram pour ${profileVisits} visite(s) Meta, soit ${Math.round(followRate * 100)}%. Teste une bio plus explicite, une preuve sociale visible et une créa qui préqualifie mieux la promesse.`,
          "profile_to_follow_rate",
          followRate,
          comparisonCostPerVisit,
          profileVisits,
          {
            priority: "medium",
            evidence: `Coût/visite ${(comparisonCostPerVisit / 100).toFixed(2)} € → ${(currentCostPerVisit / 100).toFixed(2)} € · baisse requise ≥ ${Math.round(IG_COST_PER_VISIT_IMPROVEMENT_THRESHOLD * 100)} % · ${profileVisits} visite(s) Meta · ${follows} follow(s) observé(s) dans Instagram · taux ${Math.round(followRate * 100)} % · seuil ${Math.round(IG_FOLLOW_RATE_THRESHOLD * 100)} %.`,
            diagnosis: "La campagne attire des visites, mais le profil ne convertit pas suffisamment cette intention en abonnement observé.",
            recommendedAction: "Tester une bio plus explicite, une preuve sociale visible et une créa qui préqualifie mieux la promesse.",
            expectedImpact: "Améliorer le taux visite → follow sans confondre les visites Meta avec les abonnements observés dans Instagram.",
            confidence: "low",
            sourceCoverage: "Meta Ads + Instagram · visites profil attribuées, follows observés · campagne et période comparées",
            provenance: provenance("meta+instagram", "estimee"),
          },
        ),
      );
    }

    const previousFollows = observation?.comparison.follows ?? null;
    const currentEngagement = observation?.current.engagementPerFollower ?? null;
    const previousEngagement = observation?.comparison.engagementPerFollower ?? null;
    if (observation?.connected && follows !== null && previousFollows !== null && currentEngagement !== null && previousEngagement !== null && follows > previousFollows * (1 + IG_FOLLOWS_GROWTH_THRESHOLD) && currentEngagement < previousEngagement * (1 - IG_ENGAGEMENT_DECLINE_THRESHOLD)) {
      proposals.push(
        baseProposal(
          campaign,
          "ig_follows_moins_engages",
          "Les follows observés progressent, mais l’engagement par follower baisse",
          `Instagram observe ${follows} follow(s) sur la période contre ${previousFollows} auparavant, tandis que les interactions par follower passent de ${previousEngagement.toFixed(1)} à ${currentEngagement.toFixed(1)}. Vérifie que la promesse publicitaire attire la bonne audience.`,
          "instagram_engagement_per_follower",
          currentEngagement,
          previousEngagement,
          follows,
          {
            priority: "medium",
            evidence: `Follows observés ${previousFollows} → ${follows} · hausse requise ≥ ${Math.round(IG_FOLLOWS_GROWTH_THRESHOLD * 100)} % · interactions/follower ${previousEngagement.toFixed(1)} → ${currentEngagement.toFixed(1)} · baisse requise ≥ ${Math.round(IG_ENGAGEMENT_DECLINE_THRESHOLD * 100)} % · observation Instagram.`,
            diagnosis: "La croissance de l’audience ne s’accompagne pas du même niveau d’interaction avec le contenu.",
            recommendedAction: "Resserrer la promesse de la créa et vérifier les contenus consommés par les nouveaux followers.",
            expectedImpact: "Améliorer la qualité de l’audience acquise, pas seulement le volume de followers.",
            confidence: "low",
            sourceCoverage: "Instagram · follows et interactions observés · deux périodes comparées · non attribués à la campagne",
            provenance: provenance("meta+instagram", "estimee"),
          },
        ),
      );
    }
  }

  if (campaign.campaignType === "retargeting") {
    const comparison = campaign.comparisonMetrics;
    const frequency = ratio(metricValue(metrics, "impressions"), metricValue(metrics, "reach"));
    const comparisonFrequency = ratio(metricValue(comparison, "impressions"), metricValue(comparison, "reach"));
    const ctr = ratio(metricValue(metrics, "linkClicks"), metricValue(metrics, "impressions"));
    const comparisonCtr = ratio(metricValue(comparison, "linkClicks"), metricValue(comparison, "impressions"));
    const currentLeads = metricValue(metrics, "leads");
    const comparisonLeads = metricValue(comparison, "leads");
    const currentSpend = metricValue(metrics, "spendCents");
    const comparisonSpend = metricValue(comparison, "spendCents");
    const currentCpa = currentLeads !== null && currentLeads > 0 && currentSpend !== null ? currentSpend / currentLeads : null;
    const comparisonCpa = comparisonLeads !== null && comparisonLeads > 0 && comparisonSpend !== null ? comparisonSpend / comparisonLeads : null;
    const targetCpa = campaign.targets?.targetCpaCents ?? null;
    const targetCpaNote = targetCpa !== null && targetCpa > 0 && currentCpa !== null
      ? ` · cible CPA ${(targetCpa / 100).toFixed(2)} € · écart ${(((currentCpa - targetCpa) / targetCpa) * 100).toFixed(0)} %`
      : "";
    const audienceSignals = campaign.retargetingAudiences ?? [];
    const metricCoverage = campaign.metricCoverageRate == null ? "indisponible" : `${Math.round(campaign.metricCoverageRate * 100)} % des jours de la période`;
    const missingBuyerExclusion = audienceSignals.filter(
      (audience) => audience.active && audience.targetingAvailable && audience.buyerAudienceDetected && !audience.buyerAudienceExcluded,
    );
    if (missingBuyerExclusion.length > 0) {
      const names = missingBuyerExclusion.map((audience) => `« ${audience.adSetName} »`).join(", ");
      proposals.push(
        baseProposal(
          campaign,
          "rt_exclusion_manquante",
          "Une audience acheteurs semble active sans exclusion explicite",
          `Meta signale une audience nommée acheteurs/clients incluse dans ${names}. Vérifie dans Meta Ads que les acheteurs récents sont exclus avant de continuer à investir sur cette audience de retargeting.`,
          "buyer_audience_exclusion",
          missingBuyerExclusion.length,
          0,
          missingBuyerExclusion.length,
          {
            priority: "high",
            evidence: `${missingBuyerExclusion.length} ensemble(s) actif(s) contiennent une audience acheteurs/clients sans audience acheteurs exclue · ciblage Meta disponible · couverture métrique ${metricCoverage}.`,
            diagnosis: "Le ciblage actif peut réexposer des clients déjà convertis ; le nom de l’audience est un signal à confirmer dans Meta Ads, pas une preuve d’appartenance individuelle.",
            recommendedAction: "Ouvrir l’ensemble dans Meta Ads et ajouter l’audience acheteurs/clients récente aux exclusions si elle n’y figure pas déjà.",
            expectedImpact: "Réduire la dépense sur des acheteurs déjà convertis et préserver la taille utile de l’audience de retargeting.",
            confidence: "low",
            sourceCoverage: `Meta Ads · ciblage adset et statuts · ${metricCoverage} · détection heuristique par libellé d’audience, confirmation requise dans Meta`,
            provenance: provenance("meta", "directe"),
          },
        ),
      );
    }

    const windowSignals = audienceSignals.filter(
      (audience) => audience.active && audience.targetingAvailable && audience.windowDays !== null && audience.cpaCents !== null && audience.leads !== null && audience.leads >= RT_MIN_WINDOW_LEADS,
    );
    if (windowSignals.length >= 2) {
      const best = windowSignals.reduce((winner, audience) => (audience.cpaCents! < winner.cpaCents! ? audience : winner));
      const inefficient = windowSignals
        .filter((audience) => audience.adSetId !== best.adSetId && audience.cpaCents! > best.cpaCents! * RT_WINDOW_CPA_RATIO)
        .sort((left, right) => (right.cpaCents ?? 0) - (left.cpaCents ?? 0))[0];
      if (inefficient) {
        proposals.push(
          baseProposal(
            campaign,
            "rt_fenetre_inefficace",
            "Une fenêtre de retargeting coûte nettement plus cher",
            `La fenêtre ${inefficient.windowDays} jours affiche un CPA de ${(inefficient.cpaCents! / 100).toFixed(2)} €, contre ${(best.cpaCents! / 100).toFixed(2)} € pour la meilleure fenêtre (${best.windowDays} jours). Vérifie la taille, le chevauchement et l’exclusion des fenêtres dans Meta Ads.`,
            "retargeting_window_cpa",
            inefficient.cpaCents,
            best.cpaCents,
            inefficient.leads ?? 0,
            {
              priority: "medium",
              evidence: `CPA fenêtre ${inefficient.windowDays} j ${(inefficient.cpaCents! / 100).toFixed(2)} € · meilleure fenêtre ${best.windowDays} j ${(best.cpaCents! / 100).toFixed(2)} € · seuil ${RT_WINDOW_CPA_RATIO.toFixed(1)}× · au moins ${RT_MIN_WINDOW_LEADS} leads par fenêtre.`,
              diagnosis: "Une fenêtre identifiée dans le ciblage transforme moins efficacement que la meilleure fenêtre comparable sur la période.",
              recommendedAction: "Comparer les fenêtres dans Meta Ads, vérifier les exclusions et déplacer progressivement le budget vers la fenêtre la plus efficace après contrôle du volume.",
              expectedImpact: "Réduire le CPA du retargeting sans augmenter la pression publicitaire sur une audience déjà sollicitée.",
              confidence: "low",
              sourceCoverage: `Meta Ads · coûts et leads par ensemble · ${metricCoverage} · fenêtre déduite du libellé de l’audience, vérification Meta requise`,
              provenance: provenance("meta", "directe"),
            },
          ),
        );
      }
    }
    if (frequency !== null && comparisonFrequency !== null && ctr !== null && comparisonCtr !== null && currentCpa !== null && comparisonCpa !== null && frequency > comparisonFrequency * (1 + RETARGETING_FREQUENCY_INCREASE_THRESHOLD) && ctr < comparisonCtr * (1 - RETARGETING_CTR_DECLINE_THRESHOLD) && currentCpa > comparisonCpa * (1 + RETARGETING_CPA_INCREASE_THRESHOLD)) {
      proposals.push(
        baseProposal(
          campaign,
          "rt_saturation",
          "Le retargeting montre un signal de saturation",
          `La campagne « ${campaign.name} » voit sa fréquence passer de ${comparisonFrequency.toFixed(1)} à ${frequency.toFixed(1)}, son CTR de ${(comparisonCtr * 100).toFixed(2)}% à ${(ctr * 100).toFixed(2)}% et son CPA de ${(comparisonCpa / 100).toFixed(2)} € à ${(currentCpa / 100).toFixed(2)} €${targetCpaNote}.`,
          "frequency",
          frequency,
          comparisonFrequency,
          metricValue(metrics, "reach") ?? 0,
          {
            priority: "high",
            evidence: `Fréquence ${comparisonFrequency.toFixed(1)} → ${frequency.toFixed(1)} · hausse requise ≥ ${Math.round(RETARGETING_FREQUENCY_INCREASE_THRESHOLD * 100)} % · CTR ${(comparisonCtr * 100).toFixed(2)} % → ${(ctr * 100).toFixed(2)} % · baisse requise ≥ ${Math.round(RETARGETING_CTR_DECLINE_THRESHOLD * 100)} % · CPA ${(comparisonCpa / 100).toFixed(2)} € → ${(currentCpa / 100).toFixed(2)} € · hausse requise ≥ ${Math.round(RETARGETING_CPA_INCREASE_THRESHOLD * 100)} %${targetCpaNote}.`,
            diagnosis: "L’audience est davantage exposée alors que l’engagement et l’efficacité se dégradent.",
            recommendedAction: "Renouveler les créas et vérifier les exclusions d’acheteurs et de prospects déjà avancés dans Meta Ads.",
            expectedImpact: "Réduire la fatigue créative et éviter de payer plusieurs fois pour une audience déjà touchée.",
            confidence: "low",
            sourceCoverage: "Meta Ads · deux périodes de 30 jours · reach directionnel, non dédupliqué par jour",
          },
        ),
      );
    }
  }

  return proposals;
}

export function buildMetaAdsInsights(data: MetaAdsDashboard): MetaInsightProposal[] {
  return data.campaigns.flatMap(buildCampaignProposals);
}

function toMaterializedInsight(
  accountId: string,
  proposal: MetaInsightProposal,
  periodStart: string,
  periodEnd: string,
): MaterializedInsight {
  const snapshot: MetaInsightSnapshot = {
    version: 1,
    campaignType: proposal.campaignType,
    ruleKey: proposal.ruleKey,
    campaignId: proposal.campaignId,
    campaignName: proposal.campaignName,
    metricKey: proposal.metricKey,
    currentValue: proposal.currentValue,
    comparisonValue: proposal.comparisonValue,
    comparisonLabel: proposal.comparisonValue === null
      ? "non disponible"
      : proposal.ruleKey === "rt_exclusion_manquante"
        ? "aucune exclusion détectée"
        : proposal.ruleKey === "rt_fenetre_inefficace"
          ? "meilleure fenêtre"
          : "période précédente",
    periodStart,
    periodEnd,
    sampleSize: proposal.sampleSize,
    provenance: proposal.provenance,
    evidence: proposal.evidence,
    diagnosis: proposal.diagnosis,
    recommendedAction: proposal.recommendedAction,
    expectedImpact: proposal.expectedImpact,
    successCriterion: proposal.successCriterion,
    confidence: proposal.confidence,
    sourceCoverage: proposal.sourceCoverage,
    priority: proposal.priority,
  };
  return {
    sourceType: "meta_ads",
    sourceId: `${proposal.campaignId}:${proposal.ruleKey}`,
    title: proposal.title,
    insightText: proposal.insightText,
    sourceLabel: `Meta Ads · ${proposal.campaignName}`,
    metricKey: proposal.metricKey,
    periodStart,
    periodEnd,
    snapshot,
    impactProjection: null,
    fingerprint: metaInsightFingerprint(accountId, proposal, periodStart, periodEnd),
  };
}

export async function materializeMetaAdsInsights(accountId: string, data: MetaAdsDashboard): Promise<number> {
  const proposals = buildMetaAdsInsights(data);
  for (const proposal of proposals) {
    await upsertMaterializedInsight(accountId, toMaterializedInsight(accountId, proposal, data.period.start, data.period.end));
  }
  return proposals.length;
}
