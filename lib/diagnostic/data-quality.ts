export type DataQualityState = "active" | "empty" | "not_tracked";

export type DataQualitySource = {
  key: "monthly" | "calls" | "sales" | "pipeline" | "content" | "email" | "meta" | "bookings" | "delivery";
  state: DataQualityState;
  records: number;
  consumers: string[];
};

export type DataQualitySummary = {
  activeSources: number;
  totalSources: number;
  sources: DataQualitySource[];
};

export function buildDataQualitySummary(input: {
  monthlyRows: number;
  calls: number;
  sales: number;
  leads: number;
  content: number;
  emailCampaigns: number;
  metaMetricRows: number;
  nativeBookingLeads: number;
}): DataQualitySummary {
  const sources: DataQualitySource[] = [
    { key: "monthly", state: input.monthlyRows > 0 ? "active" : "empty", records: input.monthlyRows, consumers: ["Dashboard", "Diagnostic", "Datas"] },
    { key: "calls", state: input.calls > 0 ? "active" : "empty", records: input.calls, consumers: ["Dashboard", "Diagnostic", "Goulot", "Scale Score"] },
    { key: "sales", state: input.sales > 0 ? "active" : "empty", records: input.sales, consumers: ["CA", "Dashboard", "Diagnostic", "Goulot"] },
    { key: "pipeline", state: input.leads > 0 ? "active" : "empty", records: input.leads, consumers: ["Pipeline", "Dashboard", "Goulot", "Copilote"] },
    { key: "content", state: input.content > 0 ? "active" : "empty", records: input.content, consumers: ["Contenu", "Goulot", "Copilote"] },
    { key: "email", state: input.emailCampaigns > 0 ? "active" : "empty", records: input.emailCampaigns, consumers: ["Email", "Attribution"] },
    { key: "meta", state: input.metaMetricRows > 0 ? "active" : "empty", records: input.metaMetricRows, consumers: ["Ads", "Attribution"] },
    { key: "bookings", state: input.nativeBookingLeads > 0 ? "active" : "empty", records: input.nativeBookingLeads, consumers: ["RDV", "Pipeline", "Attribution"] },
    { key: "delivery", state: "not_tracked", records: 0, consumers: ["Diagnostic à compléter"] },
  ];

  return {
    activeSources: sources.filter((source) => source.state === "active").length,
    totalSources: sources.length,
    sources,
  };
}
