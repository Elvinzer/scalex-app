import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { crmActions, leads as crmLeads, salesCalls } from "@/db/schema";
import { getLeads } from "@/lib/leads/queries";
import { listNativeBookingLeads } from "@/lib/native-booking/leads";

import {
  buildRevenueActions,
  type RevenueAction,
  type RevenueActionAccess,
  type RevenueCallInput,
  type RevenueCrmActionInput,
  type RevenueLeadInput,
  type RevenueNativeBookingLeadInput,
} from "./revenue-actions";

// The dashboard needs follow-up details, not call recordings, transcripts,
// comments, linked payments, or the CRM's next-appointment enrichment.
async function getDecisionActions(accountId: string): Promise<RevenueCallInput[]> {
  const rows = await db.select({
    id: salesCalls.id,
    inviteeName: salesCalls.inviteeName,
    inviteePhone: salesCalls.inviteePhone,
    outcome: salesCalls.outcome,
    decisionDueAt: salesCalls.decisionDueAt,
  }).from(salesCalls).where(and(
    eq(salesCalls.userId, accountId),
    eq(salesCalls.outcome, "awaiting_decision"),
  ));
  return rows.map((row) => ({ ...row, decisionDueAt: row.decisionDueAt?.toISOString() ?? null }));
}

async function getCrmFollowUps(accountId: string, responsibleUserId?: string): Promise<RevenueCrmActionInput[]> {
  const rows = await db.select({
    id: crmActions.id,
    leadId: crmActions.leadId,
    title: crmActions.title,
    category: crmActions.category,
    type: crmActions.type,
    dueAt: crmActions.dueAt,
    sourceId: crmActions.sourceId,
  }).from(crmActions)
    .innerJoin(crmLeads, and(eq(crmActions.leadId, crmLeads.id), eq(crmLeads.accountId, accountId)))
    .where(and(
      eq(crmActions.accountId, accountId),
      eq(crmActions.status, "open"),
      responsibleUserId ? eq(crmActions.responsibleUserId, responsibleUserId) : undefined,
    ))
    .orderBy(asc(crmActions.dueAt), desc(crmActions.priority), asc(crmActions.id))
    .limit(500);
  return rows.map((row) => ({ ...row, dueAt: row.dueAt.toISOString() }));
}

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
    permissions.calls ? getDecisionActions(accountId) : Promise.resolve([]),
    permissions.pipeline && !useCrmActions ? getLeads(accountId) : Promise.resolve([]),
    permissions.booking ? listNativeBookingLeads(accountId) : Promise.resolve([]),
    useCrmActions
      ? getCrmFollowUps(accountId, crmViewTeam ? undefined : crmUserId)
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
