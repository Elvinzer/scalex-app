import { Falco } from "@/components/falco/falco";
import { PriorityRecommendationCard } from "@/components/priority-recommendation-card";
import type { LeverOpportunity } from "@/lib/levers/opportunities";
import type { PriorityRecommendation } from "@/lib/diagnostic/priority";

import { DiscoveryOpportunityCard } from "./discovery-opportunity-card";

// Sits above the existing "Points à améliorer" full list (untouched) —
// this block never replaces it, only surfaces 1-3 picks the priority
// engine is confident about (see lib/diagnostic/priority.ts). Three
// states: real recommendations, "tout est vert" fallback (Découverte
// opportunities instead of a fabricated problem), or nothing at all when
// real problems exist but none clears the confidence threshold — the
// full list below stands on its own in that last case.
export function RecommendedForYou({
  recommendations,
  fallbackOpportunities,
  totalPointsCount,
}: {
  recommendations: PriorityRecommendation[];
  fallbackOpportunities: LeverOpportunity[];
  totalPointsCount: number;
}) {
  if (recommendations.length === 0 && totalPointsCount > 0) return null;

  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-bold">Falco te recommande de commencer par…</h2>
        <Falco
          pose="happy"
          size="sm"
          animate="enter"
          withBubble
          bubbleText="Ton business est solide. Voici où tu peux gratter quelques points."
        />
        {fallbackOpportunities.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fallbackOpportunities.map((opportunity) => (
              <DiscoveryOpportunityCard
                key={opportunity.leverKey}
                leverKey={opportunity.leverKey}
                label={opportunity.label}
                category={opportunity.category}
                effort={opportunity.effort}
                impactAmountEur={opportunity.impactAmountEur}
                impactExplanation={opportunity.impactExplanation}
                ctaLabel="Mettre en place"
                sourcePage="diagnostic_hero_fallback"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const introSentence =
    recommendations.length === 1
      ? "Un seul point ressort vraiment du lot en ce moment, le reste peut attendre."
      : "Voici ce qui va le plus faire bouger ton business, dans l'ordre.";

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold">Falco te recommande de commencer par…</h2>
      <Falco skin="diagnostic" skinSizePx={40} withBubble bubbleText={introSentence} />
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
        {recommendations.map((recommendation, index) => (
          <PriorityRecommendationCard
            key={recommendation.candidate.key}
            rank={(index + 1) as 1 | 2 | 3}
            topicType={recommendation.candidate.type}
            topicKey={recommendation.candidate.key}
            label={recommendation.candidate.label}
            category={recommendation.candidate.category}
            healthScore={recommendation.candidate.healthScore}
            extraClientsPerMonth={recommendation.candidate.extraClientsPerMonth}
            monthlyGainEur={recommendation.candidate.monthlyGainEur}
            why={recommendation.why}
            explanationPopover={recommendation.breakdown.explanationPopover}
            priorityScore={recommendation.breakdown.score}
            sourcePage="diagnostic_hero"
          />
        ))}
      </div>
      <a href="#points-a-ameliorer" className="self-start text-sm font-bold text-muted-foreground hover:underline">
        Voir tous les points ({totalPointsCount}) →
      </a>
    </div>
  );
}
