export async function getInFlight<T>(
  pendingByKey: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const pending = pendingByKey.get(key);
  if (pending) return pending;

  const promise = factory();
  pendingByKey.set(key, promise);

  try {
    return await promise;
  } finally {
    if (pendingByKey.get(key) === promise) {
      pendingByKey.delete(key);
    }
  }
}
