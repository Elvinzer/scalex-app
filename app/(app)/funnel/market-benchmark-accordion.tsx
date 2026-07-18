"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { BenchmarkMeter } from "@/components/benchmark-meter";
import { SectorPicker } from "@/components/sector-picker";
import { STAGE_TITLES, type FunnelStageKey } from "@/lib/agent/knowledge";
import { BENCHMARK_DISCLAIMER, getBenchmark, SECTOR_LABELS, type SectorKey } from "@/lib/benchmarks";
import type { FunnelRates } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

import { KeyRequiredModal } from "./key-required-modal";
import { StageInsightPanel, type ExistingStageInsight } from "./stage-insight-panel";

// The single source of truth for market benchmarks — every funnel stage
// lives here, Setting and Closing combined, instead of being split across
// three separate "Repères du marché" boxes (one per tab). Stages without a
// numeric band for the current sector (outreachRate, proposalRate,
// closingRate — see lib/benchmarks.ts) still render their own rate via
// BenchmarkMeter, just without the comparison ruler. Clicking a stat opens
// a short question flow that generates a personalized AI insight.
export function MarketBenchmarkAccordion({
  sector,
  benchmark,
  settingRates,
  showUpRate,
  closingRate,
  existingInsights,
  hasWorkingKey,
}: {
  sector: SectorKey | null;
  benchmark: ReturnType<typeof getBenchmark>;
  settingRates: FunnelRates;
  showUpRate: number | null;
  closingRate: number | null;
  existingInsights: Partial<Record<FunnelStageKey, ExistingStageInsight>>;
  hasWorkingKey: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeStage, setActiveStage] = useState<FunnelStageKey | null>(null);
  const [showKeyRequired, setShowKeyRequired] = useState(false);
  const sectorLabel = sector ? SECTOR_LABELS[sector] : "secteur non renseigné";

  function ClickableStat({ stage, value, band }: { stage: FunnelStageKey; value: number | null; band: ReturnType<typeof getBenchmark>["responseRate"] }) {
    return (
      <button
        type="button"
        onClick={() => (hasWorkingKey ? setActiveStage(stage) : setShowKeyRequired(true))}
        className="rounded-xl p-2 text-left transition-colors hover:bg-muted/60"
      >
        <BenchmarkMeter label={STAGE_TITLES[stage]} value={value} band={band} />
      </button>
    );
  }

  return (
    <div className="sticker-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
      >
        <span className="text-sm font-bold">Repères du marché — {sectorLabel}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border p-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Où tu te situes vs des ordres de grandeur du secteur, sur chaque étape du funnel —
              prospection et closing confondus. Clique un taux pour un diagnostic personnalisé.
            </p>
            <SectorPicker sector={sector} />
          </div>

          <div>
            <p className="mt-6 mb-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Setting · prospection
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <ClickableStat stage="outreachRate" value={settingRates.outreachRate} band={null} />
              <ClickableStat
                stage="responseRate"
                value={settingRates.responseRate}
                band={benchmark.responseRate}
              />
              <ClickableStat stage="proposalRate" value={settingRates.proposalRate} band={null} />
              <ClickableStat
                stage="bookingRate"
                value={settingRates.bookingRate}
                band={benchmark.bookingRate}
              />
            </div>
          </div>

          <div>
            <p className="mt-8 mb-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Closing · vente
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ClickableStat stage="showUpRate" value={showUpRate} band={benchmark.showUpRate} />
              <ClickableStat stage="closingRate" value={closingRate} band={null} />
            </div>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">{BENCHMARK_DISCLAIMER}</p>
        </div>
      )}

      {showKeyRequired && <KeyRequiredModal onClose={() => setShowKeyRequired(false)} />}

      {activeStage && (
        <StageInsightPanel
          stage={activeStage}
          label={STAGE_TITLES[activeStage]}
          existingInsight={existingInsights[activeStage] ?? null}
          onClose={() => setActiveStage(null)}
        />
      )}
    </div>
  );
}
