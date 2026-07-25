export const LEAD_SOURCES = [
  "instagram", "tiktok", "youtube", "linkedin", "x", "facebook",
  "email_newsletter", "ads", "bouche_a_oreille", "autre",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  email_newsletter: "Email / newsletter",
  ads: "Publicité",
  bouche_a_oreille: "Bouche-à-oreille",
  autre: "Autre",
};

// No-show is a STATUS on "rdv_fixe" (isNoShow), never its own stage —
// recoverable back into "conversation".
export const LEAD_STAGES = ["nouveau_lead", "conversation", "rdv_fixe", "rdv_honore", "close", "perdu"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  nouveau_lead: "Nouveau lead",
  conversation: "Conversation",
  rdv_fixe: "RDV fixé",
  rdv_honore: "RDV honoré",
  close: "Closé (gagné)",
  perdu: "Perdu",
};

export const LEAD_LOST_REASONS = ["pas_le_budget", "pas_le_moment", "concurrent", "ghoste", "autre"] as const;
export type LeadLostReason = (typeof LEAD_LOST_REASONS)[number];

export const LEAD_LOST_REASON_LABELS: Record<LeadLostReason, string> = {
  pas_le_budget: "Pas le budget",
  pas_le_moment: "Pas le moment",
  concurrent: "Concurrent",
  ghoste: "Ghosté",
  autre: "Autre",
};

export type LeadRow = {
  id: string;
  firstName: string;
  lastName: string;
  source: LeadSource;
  offerId: string | null;
  potentialValueEur: number;
  setterId: string | null;
  closer: string | null;
  stage: LeadStage;
  isNoShow: boolean;
  lostReason: LeadLostReason | null;
  saleId: string | null;
  reminderDate: string | null;
  reminderNote: string | null;
  reminderDone: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeadCommentRow = {
  id: string;
  leadId: string;
  userId: string;
  body: string;
  createdAt: string;
};

export type LeadStageHistoryRow = {
  id: string;
  leadId: string;
  fromStage: LeadStage | null;
  toStage: LeadStage;
  changedAt: string;
};

export type LeadWithRelations = LeadRow & {
  comments: LeadCommentRow[];
  history: LeadStageHistoryRow[];
};
