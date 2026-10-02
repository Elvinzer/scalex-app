import { describe, expect, it } from "vitest";

import {
  actionCompletionSchema,
  actionRescheduleSchema,
  actionSchema,
  bookingLinkSchema,
  changeStageSchema,
  crmCaptureCommandSchema,
  crmExtensionUpdateSchema,
  crmLeadCaptureSchema,
  contactStateSchema,
  crmTimeZoneSchema,
  leadFieldsSchema,
  noteSchema,
  outcomeSchema,
  qualificationSchema,
  reopenSchema,
  responsibilitySchema,
  responseSchema,
} from "./schemas";

const leadId = "00000000-0000-4000-8000-000000000001";
const actionId = "00000000-0000-4000-8000-000000000002";
const idempotencyKey = "crm-operation-0001";

const appMutationInputs = [
  ["capture", crmLeadCaptureSchema, { handle: "fixture", platform: "instagram" }],
  ["update lead fields", leadFieldsSchema, { leadId, displayName: "Fixture" }],
  ["change stage", changeStageSchema, { leadId, stage: "first_message_sent" }],
  ["set outcome", outcomeSchema, { leadId, outcome: "no_show" }],
  ["add note", noteSchema, { leadId, body: "Fixture note" }],
  ["create action", actionSchema, { leadId, category: "prospecting", type: "follow_up", title: "Fixture action", dueAt: "2026-10-02T09:00:00.000Z" }],
  ["complete action", actionCompletionSchema, { actionId, status: "completed" }],
  ["reschedule action", actionRescheduleSchema, { actionId, dueAt: "2026-10-03T09:00:00.000Z" }],
  ["mark contacted", contactStateSchema, { leadId }],
  ["mark response", responseSchema, { leadId }],
  ["save qualification", qualificationSchema, { leadId, body: "Fixture qualification" }],
  ["send booking link", bookingLinkSchema, { leadId }],
  ["reopen lead", reopenSchema, { leadId, stage: "first_message_sent" }],
  ["reassign lead", responsibilitySchema, { leadId, setterId: null }],
  ["extension capture command", crmCaptureCommandSchema, { profile: { handle: "fixture", platform: "instagram" } }],
  ["extension lead update", crmExtensionUpdateSchema, { leadId, stage: "first_message_sent" }],
] as const;

describe("CRM mutation idempotency contracts", () => {
  it.each(appMutationInputs)("requires an idempotency key for %s", (_name, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.safeParse({ ...input, idempotencyKey }).success).toBe(true);
  });

  it("validates the timezone used by the due-today action filter", () => {
    expect(crmTimeZoneSchema.safeParse("America/Los_Angeles").success).toBe(true);
    expect(crmTimeZoneSchema.safeParse("not/a-timezone").success).toBe(false);
    expect(actionCompletionSchema.safeParse({
      actionId,
      status: "completed",
      idempotencyKey,
      nextFilters: { dueTodayOnly: true, timeZone: "America/Los_Angeles" },
    }).success).toBe(true);
    expect(actionCompletionSchema.safeParse({
      actionId,
      status: "completed",
      idempotencyKey,
      nextFilters: { dueTodayOnly: true, timeZone: "not/a-timezone" },
    }).success).toBe(false);
  });
});
