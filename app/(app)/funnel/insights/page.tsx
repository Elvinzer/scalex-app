import { redirect } from "next/navigation";

// See app/(app)/funnel/page.tsx — same rationale, now its own page under Avancé.
export default function FunnelInsightsPage() {
  redirect("/avance/insights");
}
