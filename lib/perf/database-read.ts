import { resetDatabaseClient } from "@/db";

import { withDatabaseReadRetry } from "./database-retry";

export function withDatabaseReadTimeout<T>(
  operation: () => Promise<T>,
  {
    operation: operationName,
    timeoutMs,
    attempts = 2,
    delayMs = 100,
  }: {
    operation: string;
    timeoutMs: number;
    attempts?: number;
    delayMs?: number;
  },
): Promise<T> {
  return withDatabaseReadRetry(operation, {
    operation: operationName,
    timeoutMs,
    attempts,
    delayMs,
    resetClient: resetDatabaseClient,
  });
}
