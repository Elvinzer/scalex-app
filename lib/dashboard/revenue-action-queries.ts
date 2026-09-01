import { getLeads } from "@/lib/leads/queries";
import { getSalesCalls } from "@/lib/iclosed/calls";
import { listNativeBookingLeads } from "@/lib/native-booking/leads";
import { getCrmActions } from "@/lib/crm/queries";

import {
  buildRevenueActions,
  type RevenueAction,
  type RevenueActionAccess,
  type RevenueCallInput,
  type RevenueCrmActionInput,
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
  crmEnabled = false,
  crmUserId,
  crmViewTeam = false,
}: {
  accountId: string;
  permissions: RevenueActionAccess;
  crmEnabled?: boolean;
  crmUserId?: string;
  crmViewTeam?: boolean;
}): Promise<RevenueAction[]> {
  const useCrmActions = crmEnabled && Boolean(crmUserId);
  const [calls, leads, nativeBookingLeads, crmActions] = await Promise.all([
    permissions.calls ? getSalesCalls(accountId) : Promise.resolve([]),
    permissions.pipeline && !useCrmActions ? getLeads(accountId) : Promise.resolve([]),
    permissions.booking ? listNativeBookingLeads(accountId) : Promise.resolve([]),
    useCrmActions
      ? getCrmActions(accountId, { status: "open", responsibleUserId: crmViewTeam ? undefined : crmUserId })
      : Promise.resolve([]),
  ]);

  const callInputs: RevenueCallInput[] = calls.map((call) => ({
    id: call.id,
    inviteeName: call.inviteeName,
    inviteePhone: call.inviteePhone,
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

  const crmActionInputs: RevenueCrmActionInput[] = crmActions.map((action) => ({
    id: action.id,
    leadId: action.leadId,
    title: action.title,
    category: action.category,
    type: action.type,
    dueAt: action.dueAt,
    sourceId: action.sourceId,
  }));

  return buildRevenueActions({
    calls: callInputs,
    leads: leadInputs,
    nativeBookingLeads: nativeLeadInputs,
    crmActions: crmActionInputs,
    useCrmActions,
    permissions,
  });
}
