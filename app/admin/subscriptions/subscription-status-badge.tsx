import {
  formatSubscriptionStatus,
  getSubscriptionStatusClassName,
} from "@/lib/billing/admin-subscription-format";

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${getSubscriptionStatusClassName(status)}`}
      title={`Statut Stripe : ${status}`}
    >
      {formatSubscriptionStatus(status)}
    </span>
  );
}
