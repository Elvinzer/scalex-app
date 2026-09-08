import { withTimeout } from "./with-timeout";

type InFlightOptions = {
  timeoutMs?: number;
  timeoutLabel?: string;
  // A timeout stops waiting; it does not cancel the underlying work. Keep
  // sharing its rejection until it settles to avoid starting duplicate reads.
  retainUntilSettled?: boolean;
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

  const release = () => {
    if (pendingByKey.get(key) === promise) {
      pendingByKey.delete(key);
    }
  };
  if (options?.retainUntilSettled) {
    void task.then(release, release);
    return promise;
  }
  try {
    return await promise;
  } finally {
    release();
  }
}
