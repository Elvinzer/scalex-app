// Prefix for caches derived from business data. The actual cache tag is
// account-scoped so a write from one business never invalidates every other
// business in the deployment.
export const DIAGNOSTIC_DATA_CACHE_TAG = "diagnostic-business-data";

export function diagnosticDataCacheTag(accountId: string): string {
  return `${DIAGNOSTIC_DATA_CACHE_TAG}:${accountId}`;
}
