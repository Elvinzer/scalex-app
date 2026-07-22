import { redirect } from "next/navigation";

// Funnel moved again: was the "Funnel" tab inside Diagnostic, now its own
// page under Avancé (see app/(app)/avance/funnel/page.tsx) — this route is
// kept alive so no existing link/bookmark breaks, it just forwards. That
// page's own requirePermissionOrRedirect(userId, "diagnostic") is the single
// source of truth post-redirect, not repeated here.
export default function FunnelPage() {
  redirect("/avance/funnel");
}
