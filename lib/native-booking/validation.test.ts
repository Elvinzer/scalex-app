import { describe, expect, it } from "vitest";

import {
  REMINDER_VARIABLES,
  getUnknownReminderVariables,
  nativeBookingQuestionInputSchema,
  nativeBookingQuestionTypeSchema,
  nativeBookingReminderRuleInputSchema,
  publicLeadCaptureSchema,
  publicPhoneStageSchema,
} from "./validation";

describe("native booking validation", () => {
  it("supports exactly the five configured question types", () => {
    expect(nativeBookingQuestionTypeSchema.options).toEqual(["radio", "checkbox", "text", "textarea", "select"]);
    expect(nativeBookingQuestionInputSchema.safeParse({ type: "radio", label: "Objectif", options: ["A", "B"] }).success).toBe(true);
    expect(nativeBookingQuestionInputSchema.safeParse({ type: "text", label: "Contexte", options: ["A"] }).success).toBe(false);
  });

  it("normalizes international phone input and rejects invalid numbers", () => {
    expect(publicPhoneStageSchema.safeParse({ phone: "+33 6 12 34 56 78" }).success).toBe(true);
    expect(publicPhoneStageSchema.safeParse({ phone: "+33 00 00 00 00 00" }).success).toBe(false);
  });

  it("accepts a phone-only lead before the identity fields are known", () => {
    expect(publicLeadCaptureSchema.safeParse({ phone: "+33 6 12 34 56 78", guestTimeZone: "Europe/Paris" }).success).toBe(true);
  });

  it("allows only the documented reminder variables", () => {
    expect(REMINDER_VARIABLES).toEqual(["firstName", "eventName", "date", "time", "timeZone", "meetingUrl", "managementUrl"]);
    expect(getUnknownReminderVariables("Bonjour {{firstName}}, à {{time}}.")).toEqual([]);
    expect(getUnknownReminderVariables("{{firstName}} {{unknown}} {{unknown}} ")).toEqual(["unknown"]);
    expect(nativeBookingReminderRuleInputSchema.safeParse({
      delayMinutes: 60,
      subject: "À bientôt {{firstName}}",
      message: "Ton appel est {{date}} à {{time}} ({{timeZone}}).",
      isActive: true,
    }).success).toBe(true);
    expect(nativeBookingReminderRuleInputSchema.safeParse({
      delayMinutes: 60,
      subject: "Rappel",
      message: "{{notAllowed}}",
      isActive: true,
    }).success).toBe(false);
  });
});
