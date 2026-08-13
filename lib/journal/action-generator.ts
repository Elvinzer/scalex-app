import type { ChatContext } from "@/lib/chat-context";
import type { MetricKey } from "@/lib/diagnostic/metric-keys";

export const JOURNAL_ACTION_TYPES = [
  "bottleneck",
  "lever",
  "content",
  "lead_reminder",
  "data_checkin",
] as const;

export type JournalActionType = (typeof JOURNAL_ACTION_TYPES)[number];

export const JOURNAL_ACTION_STATES = [
  "pending",
  "doing",
  "done",
  "snoozed",
  "dismissed",
] as const;

export type JournalActionState = (typeof JOURNAL_ACTION_STATES)[number];

export const JOURNAL_EFFORTS = ["faible", "moyen", "eleve"] as const;
export type JournalEffort = (typeof JOURNAL_EFFORTS)[number];

export type JournalImpact = {
  value: number;
  unit: "eur_month" | "clients_month" | "views";
  range?: { min: number; max: number };
};

export type JournalActionCandidate = {
  id: string;
  type: JournalActionType;
  sourceType: "diagnostic_metric" | "diagnostic_lever" | "content_recommendation" | "lead_reminder" | "data_checkin";
  sourceId: string;
  title: string;
  sourceInsight: string;
  metricKey: string | null;
  impact: JournalImpact | null;
  effort: JournalEffort;
  priorityScore: number;
  status: JournalActionState;
  dueDate: string | null;
  createdAt: string | null;
  doneAt: string | null;
  resumeAt: string | null;
  overdue: boolean;
  overdueDays: number;
  chatContext: ChatContext;
  href: string;
  isPersisted: boolean;
};

export type MetricActionInput = {
  key: MetricKey;
  label: string;
  category: string;
  explanation: string;
  monthlyGainEur: number | null;
  extraClients: number;
  priorityScore: number;
  status: JournalActionState;
  dueDate?: string | null;
  createdAt?: string | null;
  doneAt?: string | null;
  resumeAt?: string | null;
  overdueDays?: number;
};

export type LeverActionInput = {
  leverKey: string;
  label: string;
  category: string;
  impactAmountEur: number | null;
  impactRangeEur?: { min: number; max: number } | null;
  impactExplanation: string;
  starterStep: string | null;
  effort: JournalEffort;
  priorityScore: number;
  status: JournalActionState;
  dueDate?: string | null;
  createdAt?: string | null;
  doneAt?: string | null;
  resumeAt?: string | null;
  overdueDays?: number;
};

export type ContentActionInput = {
  recommendationId: string;
  title: string;
  rationale: string;
  estImpact: number | null;
  effort: JournalEffort;
  priorityScore: number;
  status: JournalActionState;
  createdAt?: string | null;
  doneAt?: string | null;
  resumeAt?: string | null;
  overdueDays?: number;
};

export type LeadActionInput = {
  leadId: string;
  leadName: string;
  note: string | null;
  reminderDate: string;
  priorityScore: number;
  overdueDays: number;
};

export type CheckinActionInput = {
  monthLabel: string;
  sourceInsight: string;
  priorityScore: number;
};

const METRIC_ACTION_TITLES: Record<MetricKey, string> = {
  responseRate: "Réécris ton premier message de setting",
  proposalRate: "Ajoute une question avant de proposer l'appel",
  bookingRate: "Simplifie ton invitation à réserver un appel",
  showUpRate: "Envoie un rappel personnalisé avant chaque appel",
  closingRate: "Reformule ton offre avant de conclure l'appel",
};

const METRIC_EFFORTS: Record<MetricKey, JournalEffort> = {
  responseRate: "faible",
  proposalRate: "faible",
  bookingRate: "moyen",
  showUpRate: "faible",
  closingRate: "eleve",
};

function withTiming(
  action: Omit<JournalActionCandidate, "overdue" | "overdueDays">,
  overdueDays = 0,
): JournalActionCandidate {
  return {
    ...action,
    overdue: overdueDays > 0,
    overdueDays,
  };
}

export function metricActionTitle(key: MetricKey): string {
  return METRIC_ACTION_TITLES[key];
}

export function metricActionEffort(key: MetricKey): JournalEffort {
  return METRIC_EFFORTS[key];
}

export function makeMetricAction(input: MetricActionInput): JournalActionCandidate {
  const impact = input.monthlyGainEur !== null
    ? { value: input.monthlyGainEur, unit: "eur_month" as const }
    : input.extraClients > 0
      ? { value: input.extraClients, unit: "clients_month" as const }
      : null;

  return withTiming(
    {
      id: `diagnostic_metric:${input.key}`,
      type: "bottleneck",
      sourceType: "diagnostic_metric",
      sourceId: input.key,
      title: METRIC_ACTION_TITLES[input.key],
      sourceInsight: `Goulot ${input.label} · ${input.category}`,
      metricKey: input.key,
      impact,
      effort: METRIC_EFFORTS[input.key],
      priorityScore: input.priorityScore,
      status: input.status,
      dueDate: input.dueDate ?? null,
      createdAt: input.createdAt ?? null,
      doneAt: input.doneAt ?? null,
      resumeAt: input.resumeAt ?? null,
      chatContext: {
        topicType: "metric",
        topicKey: input.key,
        topicLabel: input.label,
        sourcePage: "journal_action",
      },
      href: `/diagnostic-app?open=${encodeURIComponent(input.key)}`,
      isPersisted: input.status !== "pending" || input.createdAt !== null && input.createdAt !== undefined,
    },
    input.overdueDays,
  );
}

export function makeLeverAction(input: LeverActionInput): JournalActionCandidate {
  const impact = input.impactAmountEur !== null
    ? { value: input.impactAmountEur, unit: "eur_month" as const, ...(input.impactRangeEur ? { range: input.impactRangeEur } : {}) }
    : input.impactRangeEur
      ? { value: (input.impactRangeEur.min + input.impactRangeEur.max) / 2, unit: "eur_month" as const, range: input.impactRangeEur }
      : null;
  const title = input.starterStep?.trim() || `Commence le plan ${input.label}`;

  return withTiming(
    {
      id: `diagnostic_lever:${input.leverKey}`,
      type: "lever",
      sourceType: "diagnostic_lever",
      sourceId: input.leverKey,
      title,
      sourceInsight: `Découverte · ${input.category}`,
      metricKey: null,
      impact,
      effort: input.effort,
      priorityScore: input.priorityScore,
      status: input.status,
      dueDate: input.dueDate ?? null,
      createdAt: input.createdAt ?? null,
      doneAt: input.doneAt ?? null,
      resumeAt: input.resumeAt ?? null,
      chatContext: {
        topicType: "lever",
        topicKey: input.leverKey,
        topicLabel: input.label,
        sourcePage: "journal_action",
      },
      href: `/demarrer/${encodeURIComponent(input.leverKey)}`,
      isPersisted: input.status !== "pending" || input.createdAt !== null && input.createdAt !== undefined,
    },
    input.overdueDays,
  );
}

export function makeContentAction(input: ContentActionInput): JournalActionCandidate {
  return withTiming(
    {
      id: `content_recommendation:${input.recommendationId}`,
      type: "content",
      sourceType: "content_recommendation",
      sourceId: input.recommendationId,
      title: `Tourne la vidéo « ${input.title} »`,
      sourceInsight: "Contenu · recommandation YouTube",
      metricKey: null,
      impact: input.estImpact !== null ? { value: input.estImpact, unit: "views" as const } : null,
      effort: input.effort,
      priorityScore: input.priorityScore,
      status: input.status,
      dueDate: null,
      createdAt: input.createdAt ?? null,
      doneAt: input.doneAt ?? null,
      resumeAt: input.resumeAt ?? null,
      chatContext: {
        topicType: "content_idea",
        topicKey: input.recommendationId,
        topicLabel: input.title,
        sourcePage: "journal_action",
      },
      href: "/acquisition/contenu/youtube",
      isPersisted: input.status !== "pending" || input.createdAt !== null && input.createdAt !== undefined,
    },
    input.overdueDays,
  );
}

export function makeLeadAction(input: LeadActionInput): JournalActionCandidate {
  return withTiming(
    {
      id: `lead_reminder:${input.leadId}`,
      type: "lead_reminder",
      sourceType: "lead_reminder",
      sourceId: input.leadId,
      title: `Relance ${input.leadName}`,
      sourceInsight: "Pipeline · relance prévue",
      metricKey: "followupRecovery",
      impact: null,
      effort: "faible",
      priorityScore: input.priorityScore,
      status: "pending",
      dueDate: input.reminderDate,
      createdAt: null,
      doneAt: null,
      resumeAt: null,
      chatContext: {
        topicType: "metric",
        topicKey: "followupRecovery",
        topicLabel: `Relance ${input.leadName}`,
        sourcePage: "journal_action",
      },
      href: "/ventes/pipeline",
      isPersisted: true,
    },
    input.overdueDays,
  );
}

export function makeCheckinAction(input: CheckinActionInput): JournalActionCandidate {
  return {
    id: `data_checkin:${input.monthLabel}`,
    type: "data_checkin",
    sourceType: "data_checkin",
    sourceId: input.monthLabel,
    title: "Renseigne tes chiffres du dernier mois",
    sourceInsight: input.sourceInsight,
    metricKey: null,
    impact: null,
    effort: "faible",
    priorityScore: input.priorityScore,
    status: "pending",
    dueDate: null,
    createdAt: null,
    doneAt: null,
    resumeAt: null,
    overdue: false,
    overdueDays: 0,
    chatContext: {
      topicType: "general",
      topicKey: null,
      topicLabel: null,
      sourcePage: "journal_checkin",
    },
    href: "/datas",
    isPersisted: false,
  };
}

export function sortJournalActions(actions: JournalActionCandidate[]): JournalActionCandidate[] {
  return [...actions].sort((left, right) => {
    const overdueRank = Number(right.overdue) - Number(left.overdue);
    if (overdueRank !== 0) return overdueRank;
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
    const dueDateRank = (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31");
    if (dueDateRank !== 0) return dueDateRank;
    return left.id.localeCompare(right.id);
  });
}
