import { CLOSING_STAGE_LABELS, CLOSING_STAGE_TIPS, type ClosingRates, type ClosingStage } from "@/lib/closing/metrics";
import { STAGE_LABELS, STAGE_TIPS, type FunnelRates, type FunnelStage } from "@/lib/setting/funnel";

const CLOSING_STAGES: ClosingStage[] = ["showUpRate", "closingRate"];

export type OverviewBottleneck =
  | { source: "setting"; stage: FunnelStage; rate: number }
  | { source: "closing"; stage: ClosingStage; rate: number };

// The funnel's overall bottleneck is the lowest conversion rate across every
// stage, Setting and Closing combined — mirrors findBottleneck/
// findClosingBottleneck, just merged across both stage sets.
export function findOverviewBottleneck(
  settingRates: FunnelRates,
  closingRates: ClosingRates
): OverviewBottleneck | null {
  let worst: OverviewBottleneck | null = null;

  for (const stage of Object.keys(settingRates) as FunnelStage[]) {
    const value = settingRates[stage];
    if (value === null) continue;
    if (worst === null || value < worst.rate) {
      worst = { source: "setting", stage, rate: value };
    }
  }

  for (const stage of CLOSING_STAGES) {
    const value = closingRates[stage];
    if (value === null) continue;
    if (worst === null || value < worst.rate) {
      worst = { source: "closing", stage, rate: value };
    }
  }

  return worst;
}

export function overviewBottleneckLabel(bottleneck: OverviewBottleneck): string {
  return bottleneck.source === "setting"
    ? STAGE_LABELS[bottleneck.stage]
    : CLOSING_STAGE_LABELS[bottleneck.stage];
}

export function overviewBottleneckTip(bottleneck: OverviewBottleneck): string {
  return bottleneck.source === "setting"
    ? STAGE_TIPS[bottleneck.stage]
    : CLOSING_STAGE_TIPS[bottleneck.stage];
}
