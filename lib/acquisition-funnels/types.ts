export const ACQUISITION_FUNNEL_KEYS = [
  "lead_magnet",
  "vsl",
  "quiz",
  "appel_direct",
  "setting_dm",
  "webinaire",
  "challenge",
  "newsletter",
  "vente_directe",
  "communaute",
] as const;

export type AcquisitionFunnelKey = (typeof ACQUISITION_FUNNEL_KEYS)[number];

export type AcquisitionFunnelStep = {
  order: number;
  metricKey: string;
  inputMetricKey: string;
  label: string;
  unit: string;
  benchmarkKey: string | null;
};

export type AcquisitionFunnelCatalogEntry = {
  funnelKey: AcquisitionFunnelKey;
  label: string;
  description: string;
  steps: AcquisitionFunnelStep[];
};

export type AcquisitionFunnelBenchmark = {
  funnelKey: AcquisitionFunnelKey;
  benchmarkKey: string;
  value: number;
  sector: string | null;
};

export type AcquisitionFunnelSelection = {
  funnels: AcquisitionFunnelKey[];
  primaryFunnel: AcquisitionFunnelKey;
  inferred: boolean;
};

export type AcquisitionMetricValues = Record<string, number | null>;

export function isAcquisitionFunnelKey(value: unknown): value is AcquisitionFunnelKey {
  return typeof value === "string" && (ACQUISITION_FUNNEL_KEYS as readonly string[]).includes(value);
}
