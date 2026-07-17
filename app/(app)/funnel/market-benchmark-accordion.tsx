"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { BenchmarkMeter } from "@/components/benchmark-meter";
import { BENCHMARK_DISCLAIMER, getBenchmark, SECTOR_LABELS, type SectorKey } from "@/lib/benchmarks";
import { cn } from "@/lib/utils";

export function MarketBenchmarkAccordion({
  sector,
  benchmark,
  responseRate,
  bookingRate,
  showUpRate,
}: {
  sector: SectorKey | null;
  benchmark: ReturnType<typeof getBenchmark>;
  responseRate: number | null;
  bookingRate: number | null;
  showUpRate: number | null;
}) {
  const [open, setOpen] = useState(false);
  const sectorLabel = sector ? SECTOR_LABELS[sector] : "secteur non renseigné";

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
          <div className="grid gap-6 sm:grid-cols-3">
            <BenchmarkMeter
              label="Taux de réponse au 1er message"
              value={responseRate}
              band={benchmark.responseRate}
            />
            <BenchmarkMeter
              label="Taux d'appels acceptés (sur proposés)"
              value={bookingRate}
              band={benchmark.bookingRate}
            />
            <BenchmarkMeter
              label="Taux de présence à l'appel (show-up)"
              value={showUpRate}
              band={benchmark.showUpRate}
            />
          </div>
          <p className="mt-6 text-xs text-muted-foreground">{BENCHMARK_DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}
