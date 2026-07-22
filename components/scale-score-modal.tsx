"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";

import { Falco } from "@/components/falco/falco";
import { CalcPopover } from "@/components/calc-popover";
import { ScaleScoreShareCard } from "@/components/scale-score-share-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trackClient } from "@/lib/analytics-client";
import type { ScaleScoreResult } from "@/lib/diagnostic/scale-score";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import type { ScaleScoreSparklinePoint } from "@/lib/scale-score-history/queries";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<"rouge" | "ambre" | "vert", string> = {
  rouge: "Santé fragile",
  ambre: "Santé correcte",
  vert: "Santé excellente",
};

const SCALE_SCORE_EXPLANATION =
  "Ton Scale Score est la moyenne de 3 piliers : Acquisition (tes taux de prospection vs le benchmark de ta niche), Vente (tes taux de closing vs le benchmark), et Délivrabilité (à quel point tu as documenté ton process de delivery dans Mon business — en attendant une vraie métrique de rétention). Un pilier compte seulement s'il a assez de données ; le score global n'apparaît qu'à partir de 2 piliers renseignés.";

const SPARKLINE_WIDTH = 240;
const SPARKLINE_HEIGHT = 48;

function Sparkline({ points }: { points: ScaleScoreSparklinePoint[] }) {
  if (points.length < 2) return null;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * SPARKLINE_WIDTH;
    const y = SPARKLINE_HEIGHT - (p.score / 100) * SPARKLINE_HEIGHT;
    return `${x},${y}`;
  });

  return (
    <svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`} className="mt-1">
      <polyline points={coords.join(" ")} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} />
    </svg>
  );
}

function PillarBar({
  label,
  score,
  covered,
  href,
}: {
  label: string;
  score: number | null;
  covered: boolean;
  href: string;
}) {
  const tier = covered && score !== null ? getHealthTier(score) : null;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold">{label}</span>
        {covered && score !== null ? (
          <span className="font-bold tabular-nums" style={{ color: tier?.colorText }}>
            {score}
          </span>
        ) : (
          <a href={href} className="text-xs font-bold text-muted-foreground hover:underline">
            À compléter →
          </a>
        )}
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${covered && score !== null ? score : 0}%`,
            background: covered ? tier?.colorBar : "var(--border)",
          }}
        />
      </div>
    </div>
  );
}

export function ScaleScoreModal({
  open,
  onOpenChange,
  scaleScore,
  delta30d,
  sparkline,
  currentMonthlyRevenue,
  potentialMonthlyRevenue,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  scaleScore: ScaleScoreResult;
  delta30d: number | null;
  sparkline: ScaleScoreSparklinePoint[];
  currentMonthlyRevenue: number | null;
  potentialMonthlyRevenue: number | null;
}) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { score, pillars } = scaleScore;
  const tier = score !== null ? getHealthTier(score) : null;
  const hasRevenueProjection =
    score !== null && currentMonthlyRevenue !== null && potentialMonthlyRevenue !== null && potentialMonthlyRevenue > currentMonthlyRevenue;

  const pillarHref: Record<string, string> = {
    acquisition: "/datas",
    vente: "/datas",
    delivrabilite: "/business",
  };

  async function handleShare() {
    const node = shareCardRef.current;
    if (!node || isExporting) return;
    trackClient("score_modal_share_opened");
    setIsExporting(true);
    try {
      const dataUrl = await toPng(node);
      const link = document.createElement("a");
      link.download = "scalex-scale-score.png";
      link.href = dataUrl;
      link.click();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <div className="flex flex-col gap-6 bg-card">
          {score === null ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <Falco pose="sleeping" size="md" animate="enter" withBubble bubbleText="Il me faut tes chiffres pour te noter." />
              <Button asChild className="mt-2">
                <a href="/datas">Remplir mes chiffres</a>
              </Button>
            </div>
          ) : (
            <>
              <div>
                <DialogTitle className="font-display text-lg font-bold">Ton Scale Score</DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dernier calcul :{" "}
                  {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>

              {hasRevenueProjection ? (
                <ScaleScoreShareCard
                  ref={shareCardRef}
                  score={score}
                  currentMonthlyRevenue={currentMonthlyRevenue}
                  potentialMonthlyRevenue={potentialMonthlyRevenue}
                />
              ) : (
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[52px] leading-none font-bold tabular-nums" style={{ color: tier?.colorText }}>
                      {score}
                    </span>
                    <span className="text-sm text-muted-foreground">/100</span>
                    <span className="text-sm font-bold" style={{ color: tier?.colorText }}>
                      {tier && TIER_LABEL[tier.tier]}
                    </span>
                  </div>
                  {delta30d !== null && (
                    <p className={cn("mt-1 text-sm font-bold", delta30d > 0 ? "text-positive" : "text-muted-foreground")}>
                      {delta30d > 0 ? "↑" : delta30d < 0 ? "↓" : ""} {delta30d >= 0 ? "+" : ""}
                      {delta30d} sur 30 jours
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-4">
                {pillars.map((pillar) => (
                  <PillarBar
                    key={pillar.key}
                    label={pillar.label}
                    score={pillar.score}
                    covered={pillar.covered}
                    href={pillarHref[pillar.key]}
                  />
                ))}
              </div>

              {sparkline.length >= 2 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground">Évolution (8 dernières semaines)</p>
                  <Sparkline points={sparkline} />
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">Comment c&apos;est calculé ?</span>
                <CalcPopover explanation={SCALE_SCORE_EXPLANATION} />
              </div>

              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <a href="/diagnostic">Améliorer mon score</a>
                </Button>
                <Button variant="secondary" onClick={handleShare} disabled={isExporting} className="flex-1">
                  {isExporting ? "Export…" : "Partager"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
