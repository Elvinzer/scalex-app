export const SUPPORT_TICKET_TYPES = ["bug", "feature", "question"] as const;
export type SupportTicketType = (typeof SUPPORT_TICKET_TYPES)[number];

export const SUPPORT_TICKET_STATUSES = [
  "new",
  "triage",
  "in_progress",
  "waiting_on_user",
  "resolved",
  "closed",
  "duplicate",
  "declined",
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_PRIORITIES = ["low", "medium", "high", "blocking"] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_MESSAGE_VISIBILITIES = ["public", "internal"] as const;
export type SupportTicketMessageVisibility = (typeof SUPPORT_TICKET_MESSAGE_VISIBILITIES)[number];

export const SUPPORT_NOTIFICATION_STATUSES = ["pending", "sent", "failed"] as const;
export type SupportNotificationStatus = (typeof SUPPORT_NOTIFICATION_STATUSES)[number];

export type SupportTicketDetails = {
  expectedResult?: string;
  observedResult?: string;
  reproductionSteps?: string;
  impact?: string;
};

export type SupportTicketContext = {
  pageKey: string | null;
  pageLabel: string | null;
  pathname: string;
  locale: "fr" | "en";
  browser: string;
  os: string;
  userAgent: string | null;
  viewport: { width: number; height: number } | null;
  capturedAt: string;
  deploymentVersion: string | null;
};

export type SupportQueueFilters = {
  search?: string;
  status?: SupportTicketStatus;
  type?: SupportTicketType;
  priority?: SupportTicketPriority;
  assigned?: "unassigned" | "assigned";
  view?: "table" | "kanban";
};

export type SupportStaffRole = "support_agent" | "support_manager";

