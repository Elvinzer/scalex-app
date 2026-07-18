import type { BusinessProfileData } from "@/lib/business/types";

// followup_recovery — a binary compliance flag, not a rate: can't be
// cascaded/simulated like the 5 funnel metrics, so it's shown in Bloc 3 as a
// ✅/❌/❓ indicator only, never with a € figure attached.
export type FollowupCompliance = {
  key: "nonBuyers" | "noShow" | "failedPayments";
  label: string;
  status: "ok" | "critical" | "unmeasured";
};

const LABELS: Record<FollowupCompliance["key"], string> = {
  nonBuyers: "Relance non-acheteurs",
  noShow: "Relance no-show",
  failedPayments: "Relance paiements échoués",
};

export function computeFollowupCompliance(businessProfile: BusinessProfileData): FollowupCompliance[] {
  const { followups } = businessProfile.sales;
  return (Object.keys(LABELS) as FollowupCompliance["key"][]).map((key) => ({
    key,
    label: LABELS[key],
    status: followups[key] === null ? "unmeasured" : followups[key] ? "ok" : "critical",
  }));
}
