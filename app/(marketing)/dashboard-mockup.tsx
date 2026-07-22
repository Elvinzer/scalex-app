import { LOSS_BREAKDOWN, TOP_LOSSES } from "./content";

const RING_SIZE = 132;
const RING_STROKE = 20;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const SEGMENT_COLORS = ["var(--accent)", "#111111", "#c9c9c9", "#e8e6e0"];

function LossDonut() {
  let cumulative = 0;

  return (
    <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
      {LOSS_BREAKDOWN.map((segment, index) => {
        const length = (segment.percent / 100) * RING_CIRCUMFERENCE;
        const offset = -((cumulative / 100) * RING_CIRCUMFERENCE);
        cumulative += segment.percent;
        return (
          <circle
            key={segment.label}
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={SEGMENT_COLORS[index]}
            strokeWidth={RING_STROKE}
            strokeDasharray={`${length} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={offset}
          />
        );
      })}
    </svg>
  );
}

// The hero's dashboard mockup: donut breakdown + top losses. A representative
// illustration of the product, not a pixel clone of the real app — kept
// deliberately sparse per the brief's "pas trop de stats" rule.
export function DashboardMockup() {
  return (
    <div className="w-full rounded-[22px] border border-border bg-white p-6 shadow-[var(--shadow-lg)] sm:p-8">
      <div className="mb-5 flex items-center justify-between">
        <p className="font-display text-[15px] font-bold">Vue d&apos;ensemble</p>
        <span className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground">
          1 – 31 mai 2026
        </span>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-[14px] border border-border p-3.5">
          <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Pertes détectées</p>
          <p className="font-display text-lg font-bold">128 540 €</p>
        </div>
        <div className="rounded-[14px] border border-border p-3.5">
          <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Revenu récupérable</p>
          <p className="font-display text-lg font-bold text-accent">96 320 €</p>
        </div>
        <div className="rounded-[14px] border border-border p-3.5">
          <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Actions actives</p>
          <p className="font-display text-lg font-bold">23</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4 rounded-[14px] border border-border p-4">
          <div className="relative shrink-0">
            <LossDonut />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-sm font-bold">128 540 €</span>
              <span className="text-[10px] text-muted-foreground">Total des pertes</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {LOSS_BREAKDOWN.map((segment, index) => (
              <div key={segment.label} className="flex items-center gap-2 text-[11.5px]">
                <span className="size-2 rounded-full" style={{ background: SEGMENT_COLORS[index] }} />
                <span className="text-muted-foreground">{segment.label}</span>
                <span className="ml-auto font-semibold">{segment.percent} %</span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-[14px] border border-border p-4">
          <p className="mb-3 text-[11px] font-semibold text-muted-foreground">Top pertes</p>
          <div className="flex flex-col gap-3">
            {TOP_LOSSES.map((loss) => (
              <div key={loss.label} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate text-foreground">{loss.label}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="font-semibold">{loss.value}</span>
                  <span
                    className={
                      loss.severity === "Élevé"
                        ? "rounded-full bg-state-critical-bg px-2 py-0.5 text-[10px] font-bold text-state-critical"
                        : "rounded-full bg-state-caution-bg px-2 py-0.5 text-[10px] font-bold text-state-caution"
                    }
                  >
                    {loss.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
