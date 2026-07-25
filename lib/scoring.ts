// Shared ratio→0-100 score, extracted from lib/levers/opportunities.ts (used
// there for lever/watch scoring) so per-item scoring (content posts, email
// campaigns) can reuse the exact same formula instead of a second copy.
export function scoreAgainstBenchmark(current: number, benchmark: number): number {
  const ratio = current / benchmark;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}
