import { getLeads } from "@/lib/leads/queries";
import { getSalesCalls } from "@/lib/iclosed/calls";
import { listNativeBookingLeads } from "@/lib/native-booking/leads";

import {
  buildRevenueActions,
  type RevenueAction,
  type RevenueActionAccess,
  type RevenueCallInput,
  type RevenueLeadInput,
  type RevenueNativeBookingLeadInput,
} from "./revenue-actions";

/**
 * Account-scoped server read. A member without a destination permission does
 * not even load that source, then the pure projection applies the same
 * permission filter as a second server-side boundary.
 */
export async function getRevenueActions({
  accountId,
  permissions,
}: {
  accountId: string;
  permissions: RevenueActionAccess;
}): Promise<RevenueAction[]> {
  const [calls, leads, nativeBookingLeads] = await Promise.all([
    permissions.calls ? getSalesCalls(accountId) : Promise.resolve([]),
    permissions.pipeline ? getLeads(accountId) : Promise.resolve([]),
    permissions.booking ? listNativeBookingLeads(accountId) : Promise.resolve([]),
  ]);

  const callInputs: RevenueCallInput[] = calls.map((call) => ({
    id: call.id,
    inviteeName: call.inviteeName,
    outcome: call.outcome,
    decisionDueAt: call.decisionDueAt,
  }));
  const leadInputs: RevenueLeadInput[] = leads.map((lead) => ({
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    potentialValueEur: lead.potentialValueEur,
    stage: lead.stage,
    isNoShow: lead.isNoShow,
    reminderDate: lead.reminderDate,
    reminderNote: lead.reminderNote,
    reminderDone: lead.reminderDone,
    updatedAt: lead.updatedAt,
  }));
  const nativeLeadInputs: RevenueNativeBookingLeadInput[] = nativeBookingLeads.flatMap(({ lead, event }) => {
    if (lead.status !== "open" && lead.status !== "contacted") return [];
    return [
      {
        id: lead.id,
        status: lead.status,
        firstName: lead.firstName,
        lastName: lead.lastName,
        eventName: event.name,
        lastStep: lead.lastStep,
        lastSeenAt: lead.lastSeenAt.toISOString(),
      },
    ];
  });

  return buildRevenueActions({
    calls: callInputs,
    leads: leadInputs,
    nativeBookingLeads: nativeLeadInputs,
    permissions,
  });
}
