import { CalcPopover } from "@/components/calc-popover";
import { formatEur } from "@/lib/currency";

// Same amount+CalcPopover snippet as discovery-opportunity-card.tsx's own
// card, extracted so Mail/Ads/Upsell's mode Démarrer can show it without
// pulling in that card's full JSX (benchmark bar, effort badge, etc — those
// stay Découverte-only). The caller computes `amountEur`/`explanation` via
// computeLeverOpportunities(...).toImplement.find(o => o.leverKey === leverKey)
// — this component never calls into lib/levers/opportunities.ts itself.
export function LeverImpactEstimate({
  amountEur,
  rangeEur,
  explanation,
  warning,
  contextSentence,
}: {
  amountEur: number | null;
  // When present (ads/VSL's higher-uncertainty formulas), shown INSTEAD of
  // the point estimate — never both, to avoid a confusing double number.
  rangeEur?: { min: number; max: number } | null;
  explanation: string;
  warning?: string | null;
  contextSentence?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <p className="font-display text-lg font-bold tabular-nums">
          {rangeEur
            ? `≈ ${formatEur(rangeEur.min)}–${formatEur(rangeEur.max)}/mois`
            : amountEur === null
              ? "Impact : à évaluer"
              : `≈ ${formatEur(amountEur)}/mois`}
        </p>
        <CalcPopover explanation={explanation} />
      </div>
      {warning && <p className="text-xs font-bold text-state-caution">{warning}</p>}
      {contextSentence && <p className="text-xs text-muted-foreground">{contextSentence}</p>}
    </div>
  );
}
