import { revalidateTag } from "next/cache";

import { diagnosticDataCacheTag } from "@/lib/diagnostic/cache-tags";

// Business data is cached by account. Revalidating a tag rather than a list of
// shared route paths keeps one user's write from invalidating every user's
// dashboard, diagnostic, roadmap, and acquisition pages.
export function revalidateBusinessData(accountId: string): void {
  revalidateTag(diagnosticDataCacheTag(accountId), "max");
}

// Journal mutations affect the same account-scoped diagnostic projections.
// The current Server Action is refreshed automatically; other pages pick up
// the new source values through this tag on their next request.
export function revalidateJournalSurfaces(accountId: string): void {
  revalidateTag(diagnosticDataCacheTag(accountId), "max");
}
