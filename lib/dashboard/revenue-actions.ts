import type { LeadStage } from "@/lib/leads/types";

export type RevenueActionSource = "lead_reminder" | "call_decision" | "lead_no_show" | "native_booking_lead" | "crm_action";

export type RevenueActionDestination = "pipeline" | "calls" | "booking";

export type RevenueActionAccess = Record<RevenueActionDestination, boolean>;

export type RevenueLeadInput = {
  id: string;
  firstName: string;
  lastName: string;
  potentialValueEur: number;
  stage: LeadStage;
  isNoShow: boolean;
  reminderDate: string | null;
  reminderNote: string | null;
  reminderDone: boolean;
  updatedAt: string;
};

export type RevenueCallInput = {
  id: string;
  inviteeName: string | null;
  inviteePhone: string | null;
  outcome: "pending" | "closed" | "not_closed" | "awaiting_decision";
  decisionDueAt: string | null;
};

export type RevenueNativeBookingLeadInput = {
  id: string;
  status: "open" | "contacted";
  firstName: string | null;
  lastName: string | null;
  eventName: string;
  lastStep: "contact_submitted" | "slots_revealed" | "slot_selected" | "booking_failed" | "converted";
  lastSeenAt: string;
};

export type RevenueCrmActionInput = {
  id: string;
  leadId: string;
  title: string;
  category: "prospecting" | "sales" | "appointment";
  type: string;
  dueAt: string;
  sourceId?: string | null;
};

export type RevenueAction = {
  id: string;
  source: RevenueActionSource;
  sourceId: string;
  title: string;
  phone: string | null;
  reason: string;
  urgencyLabel: string;
  referenceAt: string | null;
  valueEur: number | null;
  destination: RevenueActionDestination;
  href: string;
  destinationLabel: string;
};

type SortableRevenueAction = RevenueAction & {
  sortGroup: number;
  sortAt: number;
  sortDirection: "asc" | "desc";
};

const DAY_MS = 86_400_000;
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });

function dayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function dayOffset(referenceAt: string, now: Date): number | null {
  const reference = new Date(referenceAt);
  if (Number.isNaN(reference.getTime())) return null;
  return Math.round((dayStart(reference) - dayStart(now)) / DAY_MS);
}

function timestamp(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function shortDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "date à confirmer" : SHORT_DATE_FORMAT.format(parsed);
}

function displayName(firstName: string | null | undefined, lastName: string | null | undefined, fallback: string): string {
  const name = [firstName, lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name || fallback;
}

function dueState(referenceAt: string | null, now: Date, futureLabel: string): {
  sortGroup: number;
  sortAt: number;
  sortDirection: "asc" | "desc";
  urgencyLabel: string;
} {
  const offset = referenceAt ? dayOffset(referenceAt, now) : null;
  if (offset !== null && offset < 0) {
    return {
      sortGroup: 0,
      sortAt: timestamp(referenceAt),
      sortDirection: "asc",
      urgencyLabel: `En retard de ${Math.abs(offset)} j`,
    };
  }
  if (offset === 0) {
    return { sortGroup: 1, sortAt: timestamp(referenceAt), sortDirection: "asc", urgencyLabel: "À faire aujourd’hui" };
  }
  if (referenceAt && offset !== null && offset > 0) {
    return { sortGroup: 2, sortAt: timestamp(referenceAt), sortDirection: "asc", urgencyLabel: `${futureLabel} le ${shortDate(referenceAt)}` };
  }
  return { sortGroup: 2, sortAt: Number.MAX_SAFE_INTEGER, sortDirection: "asc", urgencyLabel: "Date à définir" };
}

function nativeLeadReason(step: RevenueNativeBookingLeadInput["lastStep"]): string {
  switch (step) {
    case "contact_submitted":
      return "Coordonnées saisies sans réservation";
    case "slots_revealed":
      return "Créneaux consultés sans réservation";
    case "slot_selected":
      return "Créneau sélectionné sans confirmation";
    case "booking_failed":
      return "Confirmation interrompue";
    case "converted":
      return "Rendez-vous confirmé";
  }
}

function withDestination(action: Omit<RevenueAction, "href" | "destinationLabel">): RevenueAction {
  const destination = {
    pipeline: { label: "Pipeline", path: "/crm/pipeline", queryKey: "lead" },
    calls: { label: "Appels", path: "/crm/appels", queryKey: "call" },
    booking: { label: "Rendez-vous", path: "/ventes/rdv", queryKey: "lead" },
  }[action.destination];

  return {
    ...action,
    href: `${destination.path}?${destination.queryKey}=${encodeURIComponent(action.sourceId)}&from=dashboard`,
    destinationLabel: destination.label,
  };
}

function toPublicAction(action: SortableRevenueAction): RevenueAction {
  return {
    id: action.id,
    source: action.source,
    sourceId: action.sourceId,
    title: action.title,
    phone: action.phone,
    reason: action.reason,
    urgencyLabel: action.urgencyLabel,
    referenceAt: action.referenceAt,
    valueEur: action.valueEur,
    destination: action.destination,
    href: action.href,
    destinationLabel: action.destinationLabel,
  };
}

/**
 * Read-only projection for the Dashboard. Source rows stay authoritative:
 * this function only creates navigation data and never mutates a source.
 *
 * Deep-link contract:
 * - lead actions: /crm/pipeline?lead=<leadId>&from=dashboard
 * - closing decisions: /crm/appels?call=<callId>&from=dashboard
 * - native booking leads: /ventes/rdv?lead=<leadId>&from=dashboard
 */
export function buildRevenueActions({
  calls,
  leads,
  nativeBookingLeads,
  crmActions = [],
  useCrmActions = false,
  permissions,
  now = new Date(),
}: {
  calls: RevenueCallInput[];
  leads: RevenueLeadInput[];
  nativeBookingLeads: RevenueNativeBookingLeadInput[];
  crmActions?: RevenueCrmActionInput[];
  useCrmActions?: boolean;
  permissions: RevenueActionAccess;
  now?: Date;
}): RevenueAction[] {
  const sortable: SortableRevenueAction[] = [];
  const crmDecisionSourceIds = new Set(
    crmActions
      .filter((action) => action.type === "call_decision" && action.sourceId)
      .map((action) => action.sourceId)
  );

  if (crmActions.length > 0) {
    for (const action of crmActions) {
      const due = dueState(action.dueAt, now, "Échéance prévue");
      const destination: RevenueActionDestination = action.category === "prospecting" ? "pipeline" : "calls";
      if (!permissions[destination]) continue;
      const projected = withDestination({
        id: `crm_action:${action.id}`,
        source: "crm_action",
        sourceId: action.sourceId ?? action.leadId,
        title: action.title,
        phone: null,
        reason: "Action CRM",
        urgencyLabel: due.urgencyLabel,
        referenceAt: action.dueAt,
        valueEur: null,
        destination,
      });
      sortable.push({ ...projected, sortGroup: due.sortGroup, sortAt: due.sortAt, sortDirection: due.sortDirection });
    }
  }
  const noShowLeadIds = new Set(
    leads.filter((lead) => lead.stage === "rdv_fixe" && lead.isNoShow).map((lead) => lead.id)
  );

  if (permissions.calls) {
    for (const call of calls) {
      if (call.outcome !== "awaiting_decision") continue;
      if (useCrmActions && crmDecisionSourceIds.has(call.id)) continue;
      const due = dueState(call.decisionDueAt, now, "Réponse attendue");
      const action = withDestination({
        id: `call_decision:${call.id}`,
        source: "call_decision",
        sourceId: call.id,
        title: call.inviteeName?.trim() || "Appel sans nom",
        phone: call.inviteePhone,
        reason: "Décision de closing en attente",
        urgencyLabel: due.urgencyLabel,
        referenceAt: call.decisionDueAt,
        valueEur: null,
        destination: "calls",
      });
      sortable.push({ ...action, sortGroup: due.sortGroup, sortAt: due.sortAt, sortDirection: due.sortDirection });
    }
  }

  if (permissions.pipeline && !useCrmActions) {
    for (const lead of leads) {
      if (lead.stage === "rdv_fixe" && lead.isNoShow) {
        const action = withDestination({
          id: `lead_no_show:${lead.id}`,
          source: "lead_no_show",
          sourceId: lead.id,
          title: displayName(lead.firstName, lead.lastName, "Lead sans nom"),
          phone: null,
          reason: "No-show à récupérer",
          urgencyLabel: "No-show à récupérer",
          referenceAt: lead.updatedAt,
          valueEur: lead.potentialValueEur > 0 ? lead.potentialValueEur : null,
          destination: "pipeline",
        });
        sortable.push({
          ...action,
          sortGroup: 3,
          sortAt: timestamp(lead.updatedAt),
          sortDirection: "asc",
        });
        continue;
      }

      if (!lead.reminderDate || lead.reminderDone || noShowLeadIds.has(lead.id)) continue;
      const referenceAt = `${lead.reminderDate}T00:00:00.000Z`;
      const reminderOffset = dayOffset(referenceAt, now);
      if (reminderOffset === null || reminderOffset > 0) continue;
      const due = dueState(referenceAt, now, "Relance prévue");
      const action = withDestination({
        id: `lead_reminder:${lead.id}`,
        source: "lead_reminder",
        sourceId: lead.id,
        title: displayName(lead.firstName, lead.lastName, "Lead sans nom"),
        phone: null,
        reason: lead.reminderNote?.trim() || "Relance à faire",
        urgencyLabel: due.urgencyLabel,
        referenceAt,
        valueEur: lead.potentialValueEur > 0 ? lead.potentialValueEur : null,
        destination: "pipeline",
      });
      sortable.push({ ...action, sortGroup: due.sortGroup, sortAt: due.sortAt, sortDirection: due.sortDirection });
    }
  }

  if (permissions.booking) {
    for (const lead of nativeBookingLeads) {
      if ((lead.status !== "open" && lead.status !== "contacted") || lead.lastStep === "converted") continue;
      const action = withDestination({
        id: `native_booking_lead:${lead.id}`,
        source: "native_booking_lead",
        sourceId: lead.id,
        title: displayName(lead.firstName, lead.lastName, "Prospect sans nom"),
        phone: null,
        reason: nativeLeadReason(lead.lastStep),
        urgencyLabel: "À relancer",
        referenceAt: lead.lastSeenAt,
        valueEur: null,
        destination: "booking",
      });
      sortable.push({
        ...action,
        sortGroup: 4,
        sortAt: timestamp(lead.lastSeenAt),
        sortDirection: "desc",
      });
    }
  }

  return sortable
    .sort((a, b) => {
      if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
      if (a.sortAt !== b.sortAt) return a.sortDirection === "desc" ? b.sortAt - a.sortAt : a.sortAt - b.sortAt;
      return a.id.localeCompare(b.id);
    })
    .map(toPublicAction);
}
