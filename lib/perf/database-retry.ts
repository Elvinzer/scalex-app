import { TimeoutError, withTimeout } from "./with-timeout";

const RETRYABLE_DATABASE_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
  "55P03", // lock_not_available
  "57014", // query_canceled / statement_timeout
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
]);

type DatabaseReadRetryOptions = {
  operation: string;
  attempts?: number;
  delayMs?: number;
  timeoutMs?: number;
};

function getProperty(value: unknown, property: string): unknown {
  if (typeof value !== "object" || value === null || !(property in value)) return undefined;
  return Reflect.get(value, property);
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  let current: unknown = error;

  for (let depth = 0; depth < 3 && current; depth += 1) {
    const code = getProperty(current, "code");
    if (typeof code === "string") return code;
    current = getProperty(current, "cause");
  }

  return undefined;
}

function isRetryableDatabaseError(error: unknown): boolean {
  const code = getDatabaseErrorCode(error);
  return code ? RETRYABLE_DATABASE_CODES.has(code) : false;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries idempotent reads after transient Postgres/pooler failures.
 * Mutations must not use this helper because a lost connection can make a
 * write's commit status unknowable.
 */
export async function withDatabaseReadRetry<T>(
  operation: () => Promise<T>,
  { operation: operationName, attempts = 2, delayMs = 100, timeoutMs }: DatabaseReadRetryOptions,
): Promise<T> {
  const totalAttempts = Math.max(1, Math.min(attempts, 3));
  let lastError: unknown;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      const task = operation();
      return await (timeoutMs === undefined
        ? task
        : withTimeout(task, timeoutMs, `db-${operationName}`));
    } catch (error) {
      lastError = error;
      const timedOut = error instanceof TimeoutError;
      // A local timeout only stops waiting for the query; postgres.js keeps
      // the underlying query in flight until the server resolves it. Starting
      // a second copy would amplify pool pressure, so only retry errors that
      // already tell us the database connection or statement was interrupted.
      const retryable = !timedOut && isRetryableDatabaseError(error);
      const hasRetry = attempt + 1 < totalAttempts;
      if (!retryable || !hasRetry) throw error;

      const code = getDatabaseErrorCode(error) ?? (timedOut ? "TIMEOUT" : "unknown");
      console.warn("[db] retrying transient read", {
        operation: operationName,
        code,
        attempt: attempt + 1,
      });

      await wait(delayMs * (attempt + 1));
    }
  }

  throw lastError;
}
