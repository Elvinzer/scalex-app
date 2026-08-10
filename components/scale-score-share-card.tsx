import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { forwardRef } from "react";

import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { formatEur } from "@/lib/currency";
import { cn } from "@/lib/utils";

function formatMultiplier(current: number, potential: number, locale: string): string {
  const ratio = potential / current;
  // parseFloat drops trailing zeros on its own (1.20 -> 1.2, 2.00 -> 2),
  // matching the reference's inconsistent-looking but correct precision
  // (×3,55 / ×1,8 / ×1,2).
  return String(parseFloat(ratio.toFixed(2))).replace(".", locale === "fr" ? "," : ".");
}

// Same dark shareable-card family as components/metric-health-card.tsx (bg
// #16150F, tier glow, Scale X wordmark, footer CTA) — this is the Scale
// Score modal's variant: potential monthly revenue "if everything the app
// flags gets fixed" instead of a single metric's %. Potential/current figures
// come from app/(app)/layout.tsx (same top-3-bottlenecks basis as Dashboard's
// "manque à gagner" — see that file's comment).
export const ScaleScoreShareCard = forwardRef<
  HTMLDivElement,
  { score: number; currentMonthlyRevenue: number; potentialMonthlyRevenue: number; className?: string }
>(function ScaleScoreShareCard({ score, currentMonthlyRevenue, potentialMonthlyRevenue, className }, ref) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tier = getHealthTier(score);

  return (
    <div
      ref={ref}
      className={cn("relative flex w-full flex-col overflow-hidden rounded-[22px] p-7", className)}
      style={{ background: "#16150F" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 size-64 rounded-full"
        style={{ background: `radial-gradient(circle, ${tier.glow} 0%, transparent 70%)` }}
      />

      <div className="relative flex items-center justify-between">
        <Image src="/scalex-wordmark.png" alt="Scale X" width={200} height={50} className="h-7 w-auto" />
        <div className="text-right">
          <p className="text-[11px] tracking-wide text-[var(--text-on-dark-muted)] uppercase">{t(`scaleScore.tier.${tier.tier}`)}</p>
          <p className="font-display text-2xl font-bold tabular-nums" style={{ color: tier.colorText }}>
            {score}
            <span className="text-sm text-[var(--text-on-dark-muted)]">/100</span>
          </p>
        </div>
      </div>

      <div className="relative mt-10 flex flex-col items-center gap-2 text-center">
        <p className="text-[15px] text-[var(--text-on-dark-muted)]">{t("shared.yourRevenueIfOptimized")}</p>
        <p className="font-display text-4xl font-bold text-[var(--text-on-dark)] sm:text-5xl">{formatEur(potentialMonthlyRevenue, locale)}</p>
        <p className="text-sm text-[var(--text-on-dark-muted)]">{t("shared.perMonthLabel")}</p>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-lg font-bold text-[var(--text-on-dark-muted)]">{formatEur(currentMonthlyRevenue, locale)}</span>
          <span className="text-[var(--text-on-dark-muted)]">→</span>
          <span className="rounded-full px-3.5 py-1.5 text-base font-bold text-white" style={{ background: tier.colorBar }}>
            ×{formatMultiplier(currentMonthlyRevenue, potentialMonthlyRevenue, locale)}
          </span>
        </div>
      </div>

      <p className="relative mt-10 text-center text-[11px] text-[var(--text-on-dark-muted)]">
        {t("shared.freeProjection")}
      </p>
    </div>
  );
});
