import { useLocale, useTranslations } from "next-intl";

import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { formatPercent } from "@/lib/setting/funnel";

// "Tes leviers actifs" (Bloc 4, left column) — a LeverWatchItem (already
// active, but below its own benchmark) presented as a small stat card.
// Distinct component from DiscoveryOpportunityCard: LeverWatchItem's shape
// (statValue/benchmarkValue/score) has no impact €/effort/CTA, so it isn't
// the same card — no drawer/CTA here, purely informational, links out to
// Découverte for the actual actions.
export function OverviewActiveLeverCard({
  label,
  category,
  statValue,
  benchmarkValue,
  score,
}: {
  label: string;
  category: string;
  statValue: number;
  benchmarkValue: number;
  score: number;
}) {
  const locale = useLocale();
  const t = useTranslations("common.shared");
  const tier = getHealthTier(score);

  return (
    <div className="sticker-card flex items-center justify-between gap-3 p-4">
      <div>
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{category}</p>
        <p className="mt-0.5 font-bold">{label}</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground">
          {formatPercent(statValue, locale)} · {t("benchmark")} {formatPercent(benchmarkValue, locale)}
        </p>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
        style={{ background: `${tier.colorBar}22`, color: tier.colorText }}
      >
        {tier.tier === "vert" ? t("active") : t("watch")}
      </span>
    </div>
  );
}
