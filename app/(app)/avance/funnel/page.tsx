import { FunnelTab } from "@/app/(app)/diagnostic/funnel-tab";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

// Moved out of Diagnostic's tab bar (was ?tab=funnel) into Avancé, per the
// "Funnel/Insights aren't core diagnostic reading, they're advanced
// deep-dives" call — same FunnelTab component, same "diagnostic" permission
// gate it already had as a tab, just its own route now.
export default async function AvanceFunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");
  const params = await searchParams;
  const hasWorkingKey = Boolean(user?.anthropicApiKeyEncrypted) && !user?.anthropicApiKeyInvalid;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Funnel</h1>
      <FunnelTab accountId={accountId} sector={user?.sector ?? null} hasWorkingKey={hasWorkingKey} searchParams={params} />
    </div>
  );
}
