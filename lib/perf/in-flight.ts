import { withTimeout } from "./with-timeout";

type InFlightOptions = {
  timeoutMs?: number;
  timeoutLabel?: string;
};

export async function getInFlight<T>(
  pendingByKey: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
  options?: InFlightOptions,
): Promise<T> {
  const pending = pendingByKey.get(key);
  if (pending) return pending;

  const task = factory();
  const promise = options?.timeoutMs !== undefined
    ? withTimeout(task, options.timeoutMs, options.timeoutLabel ?? `in-flight:${key}`)
    : task;
  pendingByKey.set(key, promise);

  try {
    return await promise;
  } finally {
    if (pendingByKey.get(key) === promise) {
      pendingByKey.delete(key);
    }
  }
}
