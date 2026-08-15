import type { SupportTicketMessageVisibility, SupportTicketStatus } from "@/lib/support/types";

export function statusAfterUserReply(status: SupportTicketStatus): SupportTicketStatus {
  return ["waiting_on_user", "resolved", "closed"].includes(status) ? "triage" : status;
}

export function statusAfterStaffPublicReply(status: SupportTicketStatus): SupportTicketStatus {
  return status === "closed" || status === "declined" ? status : "waiting_on_user";
}

export function canReadSupportMessage(input: {
  visibility: SupportTicketMessageVisibility;
  isStaff: boolean;
}): boolean {
  return input.visibility === "public" || input.isStaff;
}

