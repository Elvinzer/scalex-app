import { z } from "zod";

import {
  SUPPORT_TICKET_MESSAGE_VISIBILITIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_TYPES,
} from "@/lib/support/types";
import { SUPPORT_CAPTURE_MAX_BYTES, SUPPORT_CAPTURE_MIME_TYPES } from "@/lib/support/storage";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const supportTicketIdSchema = z.string().uuid();

export const supportTicketInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  type: z.enum(SUPPORT_TICKET_TYPES),
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(5_000),
  expectedResult: optionalText(2_000),
  observedResult: optionalText(2_000),
  reproductionSteps: optionalText(3_000),
  impact: optionalText(1_000),
  pathname: z.string().trim().min(1).max(2_000),
  locale: z.enum(["fr", "en"]),
  viewportWidth: z.coerce.number().int().min(200).max(10_000).optional(),
  viewportHeight: z.coerce.number().int().min(200).max(10_000).optional(),
});

export type SupportTicketInput = z.infer<typeof supportTicketInputSchema>;

export const supportPublicMessageSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
});

export const supportAttachmentSchema = z.object({
  mimeType: z.enum(SUPPORT_CAPTURE_MIME_TYPES),
  size: z.number().int().positive().max(SUPPORT_CAPTURE_MAX_BYTES),
});

export const supportAdminUpdateSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
  assignedStaffId: z.string().uuid().nullable().optional(),
  duplicateOfTicketId: z.string().uuid().nullable().optional(),
});

export const supportAdminMessageSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(5_000),
  visibility: z.enum(SUPPORT_TICKET_MESSAGE_VISIBILITIES),
});

export const supportQueueFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  type: z.enum(SUPPORT_TICKET_TYPES).optional(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
  assigned: z.enum(["unassigned", "assigned"]).optional(),
  view: z.enum(["table", "kanban"]).default("table"),
});

export function parseOptionalFormText(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
