import { redirect } from "next/navigation";

// See app/(app)/funnel/page.tsx — same rationale, now the "Insights" tab.
export default function FunnelInsightsPage() {
  redirect("/diagnostic?tab=insights");
}
