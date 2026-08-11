import { getBenchmarkSnapshot } from "./benchmarks";
import type { SectorKey } from "@/lib/benchmarks";

// The pipeline Kanban's own closing-rate benchmark (leads travaillés ->
// closés) — deliberately separate from lib/diagnostic/benchmarks.ts's
// getDiagnosticBenchmarks, which is hard-locked to the 5 cascade metrics
// (metric-keys.ts). Same sibling-file pattern as
// lib/diagnostic/content-metrics.ts's getContentDiagnosticBenchmarks, one
// key instead of an array since there's only one pipeline metric today.
export async function getPipelineDiagnosticBenchmark(sector: SectorKey | null): Promise<number> {
  const snapshot = await getBenchmarkSnapshot(sector);
  return snapshot.pipeline_closing_rate ?? 0;
}
