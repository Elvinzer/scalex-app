import { InsightsTab } from "@/app/(app)/diagnostic/insights-tab";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

// Moved out of Diagnostic's tab bar (was ?tab=insights) into Avancé — see
// app/(app)/avance/funnel/page.tsx for the same rationale.
export default async function AvanceInsightsPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Insights</h1>
      <InsightsTab accountId={accountId} />
    </div>
  );
}
