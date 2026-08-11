import { todayUtc } from "@/lib/date-range";
import type { SalesCallRow } from "@/lib/iclosed/calls";
import type { LeadRow } from "@/lib/leads/types";

export type OverdueActionIcon = "call" | "lead" | "key" | "sync";

export type OverdueAction = {
  id: string;
  icon: OverdueActionIcon;
  title: string;
  detail: string;
  href: string;
  urgencyLabel: string;
  // Sort key only — undated "action requise" items (key/sync) use a value
  // above any realistic days-late count so they always lead the list, since
  // a broken key/integration blocks everything else.
  daysLate: number;
};

const ALWAYS_FIRST = Number.MAX_SAFE_INTEGER;

// Whole calendar days strictly in the past — a due date of today is not yet
// "en retard" (same boundary as calls-table.tsx's decisionUrgency, whose
// `days === 0` branch is still "today", not overdue).
function daysLate(iso: string): number {
  const due = new Date(iso);
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((todayUtc().getTime() - dueDay) / 86_400_000);
}

function lateLabel(days: number): string {
  return `En retard de ${days} j`;
}

export function buildOverdueActions({
  awaitingDecisionCalls,
  leads,
  keyInvalid,
  failedSyncs,
}: {
  awaitingDecisionCalls: SalesCallRow[];
  leads: LeadRow[];
  keyInvalid: boolean;
  failedSyncs: string[]; // tool labels, e.g. ["iClosed"]
}): OverdueAction[] {
  const actions: OverdueAction[] = [];

  for (const call of awaitingDecisionCalls) {
    if (!call.decisionDueAt) continue;
    const days = daysLate(call.decisionDueAt);
    if (days <= 0) continue;
    actions.push({
      id: `call-${call.id}`,
      icon: "call",
      title: call.inviteeName ?? "Appel sans nom",
      detail: "Décision de closing en attente",
      href: "/ventes/appels",
      urgencyLabel: lateLabel(days),
      daysLate: days,
    });
  }

  for (const lead of leads) {
    if (!lead.reminderDate || lead.reminderDone) continue;
    const days = daysLate(`${lead.reminderDate}T00:00:00Z`);
    if (days <= 0) continue;
    actions.push({
      id: `lead-${lead.id}`,
      icon: "lead",
      title: `${lead.firstName} ${lead.lastName}`,
      detail: lead.reminderNote?.trim() || "Relance à faire",
      href: "/ventes/pipeline",
      urgencyLabel: lateLabel(days),
      daysLate: days,
    });
  }

  if (keyInvalid) {
    actions.push({
      id: "compte-api-key",
      icon: "key",
      title: "Clé API Anthropic invalide",
      detail: "Renouvelle-la pour débloquer les insights de l'agent",
      href: "/settings",
      urgencyLabel: "Action requise",
      daysLate: ALWAYS_FIRST,
    });
  }

  for (const tool of failedSyncs) {
    actions.push({
      id: `compte-sync-${tool}`,
      icon: "sync",
      title: `Synchronisation ${tool} en échec`,
      detail: "Reconnecte-toi depuis les intégrations pour reprendre la récupération de tes appels",
      href: "/integrations",
      urgencyLabel: "Action requise",
      daysLate: ALWAYS_FIRST,
    });
  }

  return actions.sort((a, b) => b.daysLate - a.daysLate);
}
