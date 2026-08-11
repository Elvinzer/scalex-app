import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { CalcPopover } from "@/components/calc-popover";
import { formatEur } from "@/lib/currency";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import type { PipelineStats } from "@/lib/leads/stats";
import { scoreAgainstBenchmark } from "@/lib/scoring";
import { formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

import { ClosingBySourceTable } from "./closing-by-source-table";

const TIER_TEXT_CLASS: Record<"rouge" | "ambre" | "vert", string> = {
  rouge: "text-state-critical",
  ambre: "text-state-caution",
  vert: "text-state-healthy",
};

function BenchmarkedTile({
  label,
  current,
  volume,
  status,
  benchmarkPercent,
  explanation,
  // Failure rate is "good" when LOWER than the benchmark — inverting the
  // scoreAgainstBenchmark args (benchmark/current instead of current/benchmark)
  // reuses the same shared scoring function rather than a second one.
  invert = false,
}: {
  label: string;
  current: number | null;
  volume: number;
  status: "ok" | "caution" | "critical" | "unmeasured";
  benchmarkPercent: number;
  explanation: string;
  invert?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("pipeline");
  if (status === "unmeasured" || current === null) {
    return (
      <div className="sticker-card flex flex-col p-5">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-muted-foreground">{label}</p>
          <CalcPopover explanation={explanation} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("notEnoughVolume", { volume })}</p>
      </div>
    );
  }

  const benchmarkFraction = benchmarkPercent / 100;
  const score = invert ? scoreAgainstBenchmark(benchmarkFraction, current) : scoreAgainstBenchmark(current, benchmarkFraction);
  const tier = getHealthTier(score);

  return (
    <div className="sticker-card flex flex-col p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold text-muted-foreground">{label}</p>
        <CalcPopover explanation={explanation} />
      </div>
      <p className={cn("mt-2 font-display text-3xl font-bold", TIER_TEXT_CLASS[tier.tier])}>{formatPercent(current, locale)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("benchmark", { percent: benchmarkPercent })}</p>
    </div>
  );
}

export function PipelineStatsBanner({ stats, period }: { stats: PipelineStats; period: string }) {
  const locale = useLocale();
  const t = useTranslations("pipeline");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">{t("statsTitle")}</h2>
        <div className="flex gap-2">
          {[{ value: "current-month", label: t("currentMonth") }, { value: "3-months", label: t("threeMonths") }].map(({ value, label }) => (
            <Link
              key={value}
              href={`/ventes/pipeline?period=${value}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-bold transition-all",
                period === value ? "border-accent-border bg-accent-soft text-accent-text" : "border-border text-muted-foreground hover:border-border-hover"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("conversations")}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{stats.conversationsCount}</p>
          {stats.conversationsDelta !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.conversationsDelta >= 0 ? "+" : ""}
              {stats.conversationsDelta} {t("vsPrevious")}
            </p>
          )}
        </div>

        <BenchmarkedTile
          label={t("conversionRate")}
          current={stats.conversionRate.current}
          volume={stats.conversionRate.volume}
          status={stats.conversionRate.status}
          benchmarkPercent={stats.conversionRate.benchmarkPercent}
          explanation={t("conversionHelp", { closed: stats.closingBySource.reduce((sum, r) => sum + r.closed, 0), volume: stats.conversionRate.volume })}
        />

        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("potentialFollowup")}</p>
          <p className="mt-2 font-display text-3xl font-bold">{formatEur(stats.potentialInFollowupEur, locale)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("openLeadValue")}</p>
        </div>

        <BenchmarkedTile
          label={t("failureRate")}
          current={stats.failureRate.current}
          volume={stats.failureRate.volume}
          status={stats.failureRate.status}
          benchmarkPercent={stats.failureRate.benchmarkPercent}
          explanation={t("failureHelp", { volume: stats.failureRate.volume })}
          invert
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">{t("closingBySource")}</h3>
        <ClosingBySourceTable rows={stats.closingBySource} />
      </div>
    </div>
  );
}
