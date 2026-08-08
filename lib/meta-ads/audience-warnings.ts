export type MetaAudienceWarningKind =
  | "insufficient_volume"
  | "frequency_saturation"
  | "probable_overlap";

export type MetaAudienceWarning = {
  kind: MetaAudienceWarningKind;
  audienceIds: string[];
  audienceNames: string[];
  impressions: number | null;
  linkClicks: number | null;
  frequency: number | null;
  threshold: number;
};

export type MetaAudienceWarningInput = {
  id: string;
  name: string;
  active: boolean;
  included: readonly string[];
  excluded: readonly string[];
  targetingAvailable: boolean;
  impressions: number | null;
  linkClicks: number | null;
  frequency: number | null;
};

export type MetaAudienceWarningThresholds = {
  minImpressions: number;
  minClicks: number;
  frequencySaturation: number;
};

function normalizedLabels(labels: readonly string[]): string[] {
  return [...new Set(labels.map((label) => label.trim().toLocaleLowerCase()).filter(Boolean))].sort();
}

function targetingSignature(row: MetaAudienceWarningInput): string | null {
  const included = normalizedLabels(row.included);
  const excluded = normalizedLabels(row.excluded);
  if (included.length === 0 && excluded.length === 0) return null;
  return `${included.join("|")}::${excluded.join("|")}`;
}

export function buildMetaAudienceWarnings(
  rows: readonly MetaAudienceWarningInput[],
  thresholds: MetaAudienceWarningThresholds,
): MetaAudienceWarning[] {
  const warnings: MetaAudienceWarning[] = [];

  for (const row of rows) {
    if (!row.active) continue;

    const hasLowImpressions = row.impressions !== null && row.impressions < thresholds.minImpressions;
    const hasLowClicks = row.linkClicks !== null && row.linkClicks < thresholds.minClicks;
    if (hasLowImpressions || hasLowClicks) {
      warnings.push({
        kind: "insufficient_volume",
        audienceIds: [row.id],
        audienceNames: [row.name],
        impressions: row.impressions,
        linkClicks: row.linkClicks,
        frequency: row.frequency,
        threshold: hasLowImpressions ? thresholds.minImpressions : thresholds.minClicks,
      });
    }

    if (row.frequency !== null && row.frequency >= thresholds.frequencySaturation) {
      warnings.push({
        kind: "frequency_saturation",
        audienceIds: [row.id],
        audienceNames: [row.name],
        impressions: row.impressions,
        linkClicks: row.linkClicks,
        frequency: row.frequency,
        threshold: thresholds.frequencySaturation,
      });
    }
  }

  const byTargeting = new Map<string, MetaAudienceWarningInput[]>();
  for (const row of rows) {
    if (!row.active || !row.targetingAvailable) continue;
    const signature = targetingSignature(row);
    if (!signature) continue;
    const group = byTargeting.get(signature) ?? [];
    group.push(row);
    byTargeting.set(signature, group);
  }

  for (const group of byTargeting.values()) {
    if (group.length < 2) continue;
    warnings.push({
      kind: "probable_overlap",
      audienceIds: group.map((row) => row.id),
      audienceNames: group.map((row) => row.name),
      impressions: null,
      linkClicks: null,
      frequency: null,
      threshold: 2,
    });
  }

  return warnings;
}
