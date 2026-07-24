import { CalcPopover } from "@/components/calc-popover";
import { formatEur } from "@/lib/currency";

// Same amount+CalcPopover snippet as discovery-opportunity-card.tsx's own
// card, extracted so Mail/Ads/Upsell's mode Démarrer can show it without
// pulling in that card's full JSX (benchmark bar, effort badge, etc — those
// stay Découverte-only). The caller computes `amountEur`/`explanation` via
// computeLeverOpportunities(...).toImplement.find(o => o.leverKey === leverKey)
// — this component never calls into lib/levers/opportunities.ts itself.
export function LeverImpactEstimate({ amountEur, explanation }: { amountEur: number | null; explanation: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="font-display text-lg font-bold tabular-nums">
        {amountEur === null ? "Impact : à évaluer" : `≈ ${formatEur(amountEur)}/mois`}
      </p>
      <CalcPopover explanation={explanation} />
    </div>
  );
}
