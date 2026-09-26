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

const CONNECTION_FAILURE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "57P01",
  "57P02",
  "57P03",
]);

type DatabaseReadRetryOptions = {
  operation: string;
  attempts?: number;
  delayMs?: number;
  resetClient?: () => Promise<void>;
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

function isConnectionFailure(error: unknown): boolean {
  const code = getDatabaseErrorCode(error);
  return code ? CONNECTION_FAILURE_CODES.has(code) : false;
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
  { operation: operationName, attempts = 2, delayMs = 100, resetClient }: DatabaseReadRetryOptions,
): Promise<T> {
  const totalAttempts = Math.max(1, Math.min(attempts, 3));
  let lastError: unknown;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableDatabaseError(error);
      const hasRetry = attempt + 1 < totalAttempts;
      if (!retryable || !hasRetry) throw error;

      const code = getDatabaseErrorCode(error) ?? "unknown";
      console.warn("[db] retrying transient read", {
        operation: operationName,
        code,
        attempt: attempt + 1,
      });

      if (resetClient && isConnectionFailure(error)) {
        try {
          await resetClient();
        } catch {
          // The next attempt will report the database error if the new client
          // cannot connect either. Do not mask the original query failure.
        }
      }

      await wait(delayMs * (attempt + 1));
    }
  }

  throw lastError;
}
