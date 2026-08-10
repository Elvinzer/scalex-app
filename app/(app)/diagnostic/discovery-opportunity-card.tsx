"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { CalcPopover } from "@/components/calc-popover";
import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { LeverBenchmarkBar } from "@/components/lever-benchmark-bar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import { recordDiagnosticAddClicked, recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import { LEVER_BENCHMARK_INFO, LEVER_BENCHMARK_INFO_EN } from "@/lib/levers/benchmark-info";
import { cn } from "@/lib/utils";
import { QuickInsightLaunchButton } from "@/components/insight-execution/quick-insight-launch-button";

const EFFORT_CLASS: Record<"faible" | "moyen" | "eleve", string> = {
  faible: "bg-state-healthy-bg text-state-healthy",
  moyen: "bg-state-caution-bg text-state-caution",
  eleve: "bg-state-critical-bg text-state-critical",
};

// Market-average time to FIRST results, by effort tier — an order-of-magnitude
// expectation to encourage ("à minima les premiers résultats"), not a precise
// forecast, hence "en moyenne". Tied to effort like FALLBACK_EXTRA_CLIENTS in
// opportunities.ts rather than invented per-lever.
// Local drawer, same technique as app/(app)/diagnostic/auto-open-improve.tsx
// — no state lifted to the global floating bubble, no new AI role (reuses
// the general Copilote as-is, per this chantier's confirmed scope).
export function DiscoveryOpportunityCard({
  leverKey,
  label,
  category,
  effort,
  impactAmountEur,
  impactRangeEur,
  impactExplanation,
  contextSentence,
  warning,
  ctaLabel,
  currentValue,
  sourcePage,
  insightSourceId,
}: {
  leverKey: string;
  label: string;
  category: string;
  effort: "faible" | "moyen" | "eleve";
  impactAmountEur: number | null;
  // When present (ads/VSL's higher-uncertainty formulas), shown INSTEAD of
  // the point estimate — never both, to avoid a confusing double number.
  impactRangeEur?: { min: number; max: number } | null;
  impactExplanation: string;
  // "Pourquoi ce levier rapporte" — only set for ads/vsl/upsell_ascension,
  // null for every other lever.
  contextSentence?: string | null;
  // Feasibility caution (e.g. ads below the revenue threshold) — distinct
  // from the effort badge/time horizon below.
  warning?: string | null;
  ctaLabel: string;
  // Only known for "actifs à surveiller" (the lever is active, this is its
  // current KPI value) — absent for "à implémenter" (no current value yet).
  currentValue?: number | null;
  // Where this card is rendered — for improve_chat_opened's source_page.
  sourcePage: string;
  // Optional execution entry point. The default remains the discovery/detail
  // route so existing cards keep their original behavior when no source is
  // provided.
  insightSourceId?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("diagnostic.discovery");
  const [open, setOpen] = useState(false);
  const info = LEVER_BENCHMARK_INFO[leverKey];
  const localizedInfo = locale === "en" ? LEVER_BENCHMARK_INFO_EN[leverKey] ?? info : info;
  const localizedExplanation = locale === "en" ? t("calculatedFromData") : impactExplanation;
  const localizedWarning = locale === "en" && warning ? t("scaleWarning") : warning;
  const localizedContext = locale === "en" && contextSentence ? t("leverContext") : contextSentence;

  const chatContext: ChatContext = { topicType: "lever", topicKey: leverKey, topicLabel: label, sourcePage };
  const gapBadge =
    currentValue !== undefined && currentValue !== null && info?.okMax !== undefined
      ? `${Math.round(currentValue * 100)}% → ${t("target")} ${Math.round(info.okMax * 100)}%`
      : null;

  // Only reachable from the "actifs à surveiller" case now (currentValue
  // defined) — absent-lever cards below navigate to /demarrer/{leverKey}
  // instead of opening this drawer.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void recordImproveChatOpened(chatContext);
  }

  return (
    <>
      <div className="sticker-card flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{category}</p>
            <p className="mt-0.5 font-bold">{label}</p>
        {localizedInfo && <p className="mt-1 text-xs text-muted-foreground">{localizedInfo.whatIsThis}</p>}
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", EFFORT_CLASS[effort])}>
            {t(`effort.${effort}`)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <p className="font-display text-lg font-bold tabular-nums">
            {impactRangeEur
              ? `≈ ${formatEur(impactRangeEur.min, locale)}–${formatEur(impactRangeEur.max, locale)}/${t("monthShort")}`
              : impactAmountEur === null
                ? t("impactToEstimate")
                : `≈ ${formatEur(impactAmountEur, locale)}/${t("monthShort")}`}
          </p>
          <CalcPopover explanation={localizedExplanation} />
        </div>

        {localizedWarning && <p className="text-xs font-bold text-state-caution">{localizedWarning}</p>}
        {localizedContext && <p className="text-xs text-muted-foreground">{localizedContext}</p>}

        {/* Time-to-first-results horizon — only on "à implémenter" cards (a
            lever not yet in place, i.e. no currentValue), to set an honest
            expectation next to the € potential. */}
        {currentValue === undefined && (
          <p className="text-xs text-muted-foreground">
            ⏱ {t("firstResults", { horizon: t(`horizon.${effort}`) })}
          </p>
        )}

        {info?.badMax !== undefined && info?.okMax !== undefined && (
          <LeverBenchmarkBar
            badMax={info.badMax}
            okMax={info.okMax}
            excellentAt={info.excellentAt}
            currentValue={currentValue}
            centralLabel={localizedInfo?.centralLabel}
          />
        )}

        {/* Outline, not a filled accent — these cards are a grid of equivalent
            options, none is THE priority CTA, so filled accents (corail =
            priority, violet = IA) stay reserved for single, unique CTAs. */}
        <div className="flex flex-wrap items-start gap-2">
          {currentValue === undefined ? (
            // Absent lever → the guide page, not an inline drawer.
            <Button size="sm" variant="outline" asChild>
              <Link href={`/demarrer/${leverKey}`} onClick={() => void recordDiagnosticAddClicked(leverKey)}>
                {ctaLabel}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => handleOpenChange(true)}>
              {ctaLabel}
            </Button>
          )}
          {insightSourceId && <QuickInsightLaunchButton sourceType="diagnostic_lever" sourceId={insightSourceId} />}
        </div>
      </div>

      {currentValue !== undefined && (
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerContent>{open && <LazyImproveChat context={chatContext} period="3-months" gapBadge={gapBadge} />}</DrawerContent>
        </Drawer>
      )}
    </>
  );
}
