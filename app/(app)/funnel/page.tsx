import { redirect } from "next/navigation";

// Funnel is now the "Funnel" tab inside Diagnostic (see
// app/(app)/diagnostic/page.tsx + funnel-tab.tsx) — this route is kept alive
// so no existing link/bookmark breaks, it just forwards. The merged page's
// own requirePermissionOrRedirect(userId, "diagnostic") is the single source
// of truth post-redirect, not repeated here.
export default function FunnelPage() {
  redirect("/diagnostic?tab=funnel");
}
