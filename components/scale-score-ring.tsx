const SIZE = 56;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function arc(fromPercent: number, toPercent: number): { dasharray: string; dashoffset: number } {
  const length = ((toPercent - fromPercent) / 100) * CIRCUMFERENCE;
  return {
    dasharray: `${Math.max(length, 0)} ${CIRCUMFERENCE}`,
    dashoffset: -((fromPercent / 100) * CIRCUMFERENCE),
  };
}

// Sits inside the sidebar's orange-framed Scale Score card
// (components/scale-score-badge.tsx). Three stroke segments on one ring:
// 0→score (solid accent — what's actually achieved), score→potentialScore
// (accent at low opacity — what's still reachable by fixing today's known
// gaps, see lib/diagnostic/scale-score.ts's potentialScore), and the rest
// (neutral track). When potentialScore == score (everything's already at
// standard), the middle segment is simply invisible — no special-casing
// needed since its arc length is 0.
export function ScaleScoreRing({ score, potentialScore }: { score: number; potentialScore: number }) {
  const achieved = arc(0, score);
  const reachable = arc(score, potentialScore);

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0 -rotate-90">
      <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={STROKE} />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="var(--accent)"
        strokeOpacity={0.4}
        strokeWidth={STROKE}
        strokeDasharray={reachable.dasharray}
        strokeDashoffset={reachable.dashoffset}
        strokeLinecap="round"
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={STROKE}
        strokeDasharray={achieved.dasharray}
        strokeDashoffset={achieved.dashoffset}
        strokeLinecap="round"
      />
    </svg>
  );
}
