import { Button } from "@/components/ui/button";

import { PERFORMANCE_TREND, PRIORITY_ACTIONS } from "./content";

const CHART_WIDTH = 460;
const CHART_HEIGHT = 160;
const CHART_PADDING = 12;
const HIGHLIGHT_INDEX = 3; // "22 mai" — matches the reference mockup's tooltip

function chartPoints() {
  const maxValue = Math.max(...PERFORMANCE_TREND.map((p) => p.value)) * 1.15;
  const stepX = (CHART_WIDTH - CHART_PADDING * 2) / (PERFORMANCE_TREND.length - 1);

  return PERFORMANCE_TREND.map((point, index) => {
    const x = CHART_PADDING + index * stepX;
    const y = CHART_HEIGHT - CHART_PADDING - (point.value / maxValue) * (CHART_HEIGHT - CHART_PADDING * 2);
    return { ...point, x, y };
  });
}

function PerformanceChart() {
  const points = chartPoints();
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`;
  const highlighted = points[HIGHLIGHT_INDEX];

  return (
    <div className="relative">
      {highlighted && (
        <div
          className="absolute -translate-x-1/2 rounded-[12px] border border-border bg-white px-3.5 py-2.5 text-[12px] shadow-[var(--shadow-md)]"
          style={{ left: `${(highlighted.x / CHART_WIDTH) * 100}%`, top: 0 }}
        >
          <p className="font-semibold text-muted-foreground">{highlighted.label} 2026</p>
          <p className="font-display text-[15px] font-bold text-accent">
            {highlighted.value.toLocaleString("fr-FR")} €
          </p>
          <p className="text-muted-foreground">Pertes détectées</p>
        </div>
      )}

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="mt-16 w-full">
        <defs>
          <linearGradient id="performance-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#performance-area)" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={p.label}
            cx={p.x}
            cy={p.y}
            r={i === HIGHLIGHT_INDEX ? 4.5 : 3}
            fill={i === HIGHLIGHT_INDEX ? "var(--accent)" : "white"}
            stroke="var(--accent)"
            strokeWidth={2}
          />
        ))}
      </svg>

      <div className="flex justify-between text-[11px] text-muted-foreground">
        {points.map((p) => (
          <span key={p.label}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

export function ProductOverview() {
  return (
    <section id="produit" className="mx-auto max-w-[1360px] scroll-mt-20 px-6 py-16 sm:px-10 sm:py-24">
      <div className="grid items-center gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <h2 className="mb-5 text-[clamp(1.9rem,3.4vw,2.6rem)] leading-tight font-bold text-foreground">
            Tout ton business, au même endroit.
          </h2>
          <ul className="mb-7 flex flex-col gap-3">
            <li className="flex items-start gap-2.5 text-[15px] text-foreground">
              <span className="mt-0.5 text-accent">✓</span>
              Une vue claire de tes pertes et de tes opportunités.
            </li>
            <li className="flex items-start gap-2.5 text-[15px] text-foreground">
              <span className="mt-0.5 text-accent">✓</span>
              Un suivi précis des actions et de leur impact.
            </li>
          </ul>
          <Button asChild variant="outline" size="lg" className="rounded-[12px] px-7">
            <a href="/onboarding">Découvrir la plateforme</a>
          </Button>
        </div>

        <div className="grid gap-4 rounded-[22px] border border-border bg-white p-6 shadow-[var(--shadow-md)] sm:grid-cols-[1.3fr_1fr] sm:p-7">
          <div className="rounded-[14px] border border-border p-4">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-muted-foreground">Performance · 30 derniers jours</p>
            </div>
            <PerformanceChart />
          </div>

          <div className="rounded-[14px] border border-border p-4">
            <p className="mb-3 text-[12px] font-semibold text-muted-foreground">Actions prioritaires</p>
            <div className="flex flex-col gap-4">
              {PRIORITY_ACTIONS.map((action) => (
                <div key={action.label} className="flex flex-col gap-1">
                  <p className="text-[13px] font-semibold text-foreground">{action.label}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-muted-foreground">Impact potentiel : {action.impact}</span>
                    <span
                      className={
                        action.severity === "Élevé"
                          ? "rounded-full bg-state-critical-bg px-2 py-0.5 text-[10px] font-bold text-state-critical"
                          : "rounded-full bg-state-caution-bg px-2 py-0.5 text-[10px] font-bold text-state-caution"
                      }
                    >
                      {action.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
