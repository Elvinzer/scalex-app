// Shared cache tag for all projections derived from the business data.
// Mutations call revalidateBusinessData(), so a saved number or a completed
// sync never leaves the Dashboard/Diagnostic/Roadmap on an old snapshot.
export const DIAGNOSTIC_DATA_CACHE_TAG = "diagnostic-business-data";
