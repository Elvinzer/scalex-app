"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Falco } from "@/components/falco/falco";
import { ScaleScoreShareCard } from "@/components/scale-score-share-card";
import { Sparkline } from "@/components/sparkline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trackClient } from "@/lib/analytics-client";
import type { ScaleScoreGapSource, ScaleScoreResult } from "@/lib/diagnostic/scale-score";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import type { ScaleScoreSparklinePoint } from "@/lib/scale-score-history/queries";
import { cn } from "@/lib/utils";

export function ScaleScoreModal({
  open,
  onOpenChange,
  scaleScore,
  scaleScoreGapText,
  scaleScoreGapSources,
  scaleScoreMonthNote,
  delta30d,
  sparkline,
  currentMonthlyRevenue,
  potentialMonthlyRevenue,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  scaleScore: ScaleScoreResult;
  scaleScoreGapText: string | null;
  scaleScoreGapSources: ScaleScoreGapSource[];
  scaleScoreMonthNote: string | null;
  delta30d: number | null;
  sparkline: ScaleScoreSparklinePoint[];
  currentMonthlyRevenue: number | null;
  potentialMonthlyRevenue: number | null;
}) {
  const locale = useLocale();
  const t = useTranslations("common.scaleScore");
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { score } = scaleScore;
  const tier = score !== null ? getHealthTier(score) : null;
  const hasRevenueProjection =
    score !== null && currentMonthlyRevenue !== null && potentialMonthlyRevenue !== null && potentialMonthlyRevenue > currentMonthlyRevenue;
  const primaryTargetHref = scaleScoreGapSources[0]?.href ?? null;
  const calculationDetails = (
    <details className="w-full rounded-[var(--radius-card)] border border-border bg-muted/40 px-4 py-3 text-left">
      <summary className="cursor-pointer list-none text-sm font-bold">{t("calculation.title")}</summary>
      <div className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
        <p>{t("calculation.period")}</p>
        <p>{t("calculation.funnel")}</p>
        <p>{t("calculation.formula")}</p>
        <p>{t("calculation.delivery")}</p>
      </div>
    </details>
  );

  async function handleShare() {
    const node = shareCardRef.current;
    if (!node || isExporting) return;
    trackClient("score_modal_share_opened");
    setIsExporting(true);
    try {
      const dataUrl = await toPng(node);
      const link = document.createElement("a");
      link.download = "minaly-scale-score.png";
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
              <Falco
                pose="sleeping"
                size="md"
                animate="enter"
                withBubble
                bubbleText={scaleScoreGapText ?? t("scorePending")}
              />
              {primaryTargetHref && (
                <Button asChild className="mt-2">
                  <Link href={primaryTargetHref} prefetch={true} onClick={() => onOpenChange(false)}>{t("fillNumbers")}</Link>
                </Button>
              )}
              {scaleScoreGapSources.length > 0 && (
                <div className="w-full rounded-[var(--radius-card)] border border-border bg-muted/40 p-4 text-left">
                  <p className="text-sm font-bold">{t("missingDataTitle")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("missingDataHelp")}</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {scaleScoreGapSources.map((source, index) => {
                      const monthLabel = source.year !== undefined && source.month !== undefined
                        ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(source.year, source.month - 1, 1)))
                        : null;
                      const label = source.key === "month"
                        ? t("missingData.month", { month: monthLabel ?? "" })
                        : `${t(`missingData.${source.key}`)}${monthLabel ? ` · ${monthLabel}` : ""}`;
                      return (
                        <li key={`${source.key}-${source.year ?? "all"}-${source.month ?? index}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-card px-3 py-2">
                          <span className="text-sm font-bold">{label}</span>
                          <Link href={source.href} prefetch={true} onClick={() => onOpenChange(false)} className="shrink-0 text-xs font-bold text-accent-text underline-offset-2 hover:underline">
                            {t("missingData.open")}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {scaleScoreMonthNote && (
                <p className="max-w-[280px] text-xs text-muted-foreground">{scaleScoreMonthNote}</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <DialogTitle className="font-display text-lg font-bold">{t("title")}</DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("lastCalculated")} {new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
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
                    <span className="figure-score" style={{ color: tier?.colorText }}>
                      {score}
                    </span>
                    <span className="text-sm text-muted-foreground">/100</span>
                    <span className="text-sm font-bold" style={{ color: tier?.colorText }}>
                      {tier && t(`tier.${tier.tier}`)}
                    </span>
                  </div>
                  {delta30d !== null && (
                    <p className={cn("mt-1 text-sm font-bold", delta30d > 0 ? "text-positive" : "text-muted-foreground")}>
                      {delta30d > 0 ? "↑" : delta30d < 0 ? "↓" : ""} {delta30d >= 0 ? "+" : ""}
                      {delta30d} {t("over30Days")}
                    </p>
                  )}
                </div>
              )}

              {sparkline.length >= 2 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground">{t("evolution")}</p>
                  <div className="mt-1">
                    <Sparkline
                      values={sparkline.map((point) => point.score)}
                      labels={sparkline.map((point) => point.weekStart)}
                      domain={[0, 100]}
                      width={240}
                      height={48}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <Link href="/diagnostic-app" prefetch={true}>{t("improve")}</Link>
                </Button>
                <Button variant="secondary" onClick={handleShare} disabled={isExporting} className="flex-1">
                  {isExporting ? t("exporting") : t("share")}
                </Button>
              </div>
            </>
          )}
          {calculationDetails}
        </div>
      </DialogContent>
    </Dialog>
  );
}
