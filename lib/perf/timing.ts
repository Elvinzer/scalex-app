type PerfMetadata = Record<string, number | string | boolean | null | undefined>;

function isPerfDebugEnabled(): boolean {
  return process.env.PERF_DEBUG === "1";
}

function formatMetadata(metadata: PerfMetadata | undefined): string {
  if (!metadata) return "";
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return "";
  return ` ${entries.map(([key, value]) => `${key}=${String(value)}`).join(" ")}`;
}

export function logServerTiming(name: string, durationMs: number, metadata?: PerfMetadata): void {
  if (!isPerfDebugEnabled()) return;
  console.info(`[perf] ${name} ${durationMs.toFixed(1)}ms${formatMetadata(metadata)}`);
}

export async function measureAsync<T>(name: string, task: () => Promise<T>, metadata?: PerfMetadata): Promise<T> {
  const startedAt = performance.now();
  try {
    return await task();
  } finally {
    logServerTiming(name, performance.now() - startedAt, metadata);
  }
}

export function measureSync<T>(name: string, task: () => T, metadata?: PerfMetadata): T {
  const startedAt = performance.now();
  try {
    return task();
  } finally {
    logServerTiming(name, performance.now() - startedAt, metadata);
  }
}
