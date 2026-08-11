import { z } from "zod";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

import { isValidTimeZone, minutesFromTime } from "./time";

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide");

export const nativeBookingQuestionTypeSchema = z.enum(["radio", "checkbox", "text", "textarea", "select"]);

const questionOptionSchema = z.string().trim().min(1, "L’option est requise").max(120);
const metaTouchpointTokenSchema = z.string().trim().regex(/^[a-f0-9]{64}$/i, "Touchpoint invalide.").nullable().default(null);
const metaIdentifierSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/, "Identifiant Meta invalide.").nullable().default(null);

export const nativeBookingQuestionInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: nativeBookingQuestionTypeSchema,
    label: z.string().trim().min(1, "Le libellé est requis").max(180),
    helpText: z.string().trim().max(300).nullable().default(null),
    isRequired: z.boolean().default(false),
    options: z.array(questionOptionSchema).max(20).default([]),
  })
  .superRefine((question, context) => {
    const options = Array.from(new Set(question.options.map((option) => option.trim())));
    if (["radio", "checkbox", "select"].includes(question.type) && options.length < 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Ajoute au moins une option." });
    }
    if (options.length !== question.options.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Les options doivent être uniques." });
    }
    if (!["radio", "checkbox", "select"].includes(question.type) && question.options.length > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Ce type de question ne prend pas d’option." });
    }
  });

export const nativeBookingQuestionsInputSchema = z
  .array(nativeBookingQuestionInputSchema)
  .max(30, "Tu peux ajouter au maximum 30 questions.")
  .superRefine((questions, context) => {
    const ids = questions.flatMap((question) => (question.id ? [question.id] : []));
    if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Une question apparaît plusieurs fois." });
  });

export const REMINDER_VARIABLES = ["firstName", "eventName", "date", "time", "timeZone", "meetingUrl", "managementUrl"] as const;

const reminderVariablePattern = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;

function reminderVariables(value: string): string[] {
  return Array.from(value.matchAll(reminderVariablePattern), (match) => match[1] ?? "");
}

export function getUnknownReminderVariables(value: string): string[] {
  return Array.from(new Set(reminderVariables(value).filter((name) => !REMINDER_VARIABLES.includes(name as (typeof REMINDER_VARIABLES)[number]))));
}

const reminderTextSchema = z.string().trim().min(1).max(5000).superRefine((value, context) => {
  const unknown = getUnknownReminderVariables(value);
  if (unknown.length > 0) context.addIssue({ code: z.ZodIssueCode.custom, message: `Variable inconnue : ${unknown.join(", ")}.` });
});

const reminderSubjectSchema = z.string().trim().min(1, "Le sujet est requis.").max(180).superRefine((value, context) => {
  const unknown = getUnknownReminderVariables(value);
  if (unknown.length > 0) context.addIssue({ code: z.ZodIssueCode.custom, message: `Variable inconnue : ${unknown.join(", ")}.` });
});

export const nativeBookingReminderRuleInputSchema = z.object({
  id: z.string().uuid().optional(),
  delayMinutes: z.number().int().min(1, "Le délai doit être positif.").max(43200),
  subject: reminderSubjectSchema,
  message: reminderTextSchema,
  isActive: z.boolean().default(true),
});

export const nativeBookingReminderRulesInputSchema = z
  .array(nativeBookingReminderRuleInputSchema)
  .max(10, "Tu peux ajouter au maximum 10 rappels.")
  .superRefine((rules, context) => {
    const delays = rules.map((rule) => rule.delayMinutes);
    if (new Set(delays).size !== delays.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Deux rappels ne peuvent pas avoir le même délai." });
  });

export const agendaViewSchema = z.enum(["agenda", "week", "list"]);
export const agendaSourceSchema = z.enum(["native", "iclosed", "calendly"]);
export const agendaStatusSchema = z.enum(["confirmed", "cancelled", "past"]);
export const agendaRangeSchema = z.enum(["today", "next7", "next30", "custom"]);
export const agendaFiltersSchema = z.object({
  view: agendaViewSchema.default("agenda"),
  source: z.array(agendaSourceSchema).default(["native", "iclosed", "calendly"]),
  closerIds: z.array(z.string().uuid()).default([]),
  status: z.array(agendaStatusSchema).default(["confirmed"]),
  range: agendaRangeSchema.default("next7"),
  from: z.string().datetime({ offset: true }).nullable().default(null),
  to: z.string().datetime({ offset: true }).nullable().default(null),
  timeZone: z.string().refine(isValidTimeZone, "Fuseau horaire invalide").default("Europe/Paris"),
});

export const nativeBookingEventInputSchema = z.object({
  name: z.string().trim().min(2, "Le nom de l’événement est requis").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Utilise uniquement des lettres, chiffres et tirets"),
  description: z.string().trim().max(500).default(""),
  durationMinutes: z.number().int().min(15).max(240),
  bufferBeforeMinutes: z.number().int().min(0).max(240),
  bufferAfterMinutes: z.number().int().min(0).max(240),
  minNoticeMinutes: z.number().int().min(0).max(10080),
  bookingHorizonDays: z.number().int().min(1).max(365),
  timeZone: z.string().refine(isValidTimeZone, "Fuseau horaire invalide"),
  meetingLabel: z.string().trim().min(1).max(120),
  meetingUrl: z
    .string()
    .trim()
    .url("Lien de réunion invalide")
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Le lien de réunion doit commencer par http:// ou https://")
    .nullable(),
  publicHeading: z.string().trim().min(2).max(120),
  publicDescription: z.string().trim().max(300),
  confirmationTitle: z.string().trim().min(2).max(120).default("Rendez-vous confirmé"),
  bookingInstructions: z.string().trim().max(1000).default(""),
  notifyCloserOnBooking: z.boolean().default(true),
  notifyCloserOnCancellation: z.boolean().default(true),
  notifyCloserOnReschedule: z.boolean().default(true),
  requireContactBeforeSlots: z.boolean(),
  roundRobinEnabled: z.boolean(),
  questions: nativeBookingQuestionsInputSchema.default([]),
  reminders: nativeBookingReminderRulesInputSchema.default([]),
});

export const availabilityWindowSchema = z
  .object({
    startTime: timeStringSchema,
    endTime: timeStringSchema,
  })
  .refine((value) => minutesFromTime(value.endTime) > minutesFromTime(value.startTime), {
    message: "La fin doit être après le début",
    path: ["endTime"],
  });

export const availabilitySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  windows: z.array(availabilityWindowSchema).max(4),
});

export const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  type: z.enum(["closed", "custom"]),
  windows: z.array(availabilityWindowSchema).max(4).default([]),
  reason: z.string().trim().max(160).nullable().default(null),
});

export const publicContactSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis").max(80),
  lastName: z.string().trim().min(1, "Le nom est requis").max(80),
  email: z.string().trim().email("Adresse email invalide").max(254),
  phone: z.string().trim().min(7, "Numéro de téléphone invalide").max(40).refine(isValidPhoneNumber, "Numéro de téléphone invalide"),
  guestTimeZone: z.string().refine(isValidTimeZone, "Fuseau horaire invalide"),
  leadSessionKey: z.string().uuid().nullable().default(null),
  landingPage: z.string().url().nullable().default(null),
  referrer: z.string().url().nullable().default(null),
  linkId: z.string().uuid().nullable().default(null),
  metaTouchpointToken: metaTouchpointTokenSchema,
  metaCampaignExternalId: metaIdentifierSchema,
  metaAdSetExternalId: metaIdentifierSchema,
  metaAdExternalId: metaIdentifierSchema,
  utm: z.record(z.string().max(500)).default({}),
});

export const publicLeadCaptureSchema = z
  .object({
    firstName: z.string().trim().max(80).optional().default(""),
    lastName: z.string().trim().max(80).optional().default(""),
    phone: z.string().trim().min(7, "Numéro de téléphone invalide").max(40).refine(isValidPhoneNumber, "Numéro de téléphone invalide"),
    guestTimeZone: z.string().refine(isValidTimeZone, "Fuseau horaire invalide"),
    leadSessionKey: z.string().uuid().nullable().default(null),
    landingPage: z.string().url().nullable().default(null),
    referrer: z.string().url().nullable().default(null),
    linkId: z.string().uuid().nullable().default(null),
    metaTouchpointToken: metaTouchpointTokenSchema,
    metaCampaignExternalId: metaIdentifierSchema,
    metaAdSetExternalId: metaIdentifierSchema,
    metaAdExternalId: metaIdentifierSchema,
    utm: z.record(z.string().max(500)).default({}),
  });

export const publicPhoneStageSchema = z.object({
  phone: z.string().trim().min(7, "Numéro de téléphone invalide").max(40).refine(isValidPhoneNumber, "Numéro de téléphone invalide"),
});

export const publicQualificationSchema = publicContactSchema.extend({
  answers: z.record(z.string().uuid(), z.union([z.string().trim().max(5000), z.array(z.string().trim().max(500)).max(20)])).default({}),
});

export const publicBookingRequestSchema = publicQualificationSchema.extend({
  startAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  leadId: z.string().uuid().nullable().default(null),
});

export const bookingManagementTokenSchema = z.string().trim().min(32).max(128);

export const publicBookingCancelSchema = z.object({ token: bookingManagementTokenSchema });

export const publicBookingRescheduleSlotsSchema = z.object({ token: bookingManagementTokenSchema });

export const publicBookingRescheduleSchema = z.object({
  token: bookingManagementTokenSchema,
  startAt: z.string().datetime({ offset: true }),
});

export const publicLeadTouchSchema = publicQualificationSchema.extend({
  leadId: z.string().uuid(),
  lastStep: z.enum(["slots_revealed", "slot_selected", "booking_failed"]),
  startAt: z.string().datetime({ offset: true }).nullable().default(null),
});

export const publicBookingRouteSchema = z.discriminatedUnion("mode", [
  publicPhoneStageSchema.extend({ mode: z.literal("validate-phone") }),
  publicLeadCaptureSchema.extend({ mode: z.literal("capture") }),
  publicQualificationSchema.extend({ mode: z.literal("unlock") }),
  publicLeadTouchSchema.extend({ mode: z.literal("touch") }),
  publicBookingCancelSchema.extend({ mode: z.literal("cancel") }),
  publicBookingRescheduleSlotsSchema.extend({ mode: z.literal("reschedule-slots") }),
  publicBookingRescheduleSchema.extend({ mode: z.literal("reschedule") }),
  publicBookingRequestSchema.extend({ mode: z.literal("hold") }),
  publicBookingRequestSchema.extend({ mode: z.literal("book") }),
]);

export type NativeBookingEventInput = z.infer<typeof nativeBookingEventInputSchema>;
export type NativeBookingQuestionInput = z.infer<typeof nativeBookingQuestionInputSchema>;
export type NativeBookingReminderRuleInput = z.infer<typeof nativeBookingReminderRuleInputSchema>;
export type AgendaFilters = z.infer<typeof agendaFiltersSchema>;
export type AvailabilityWindowInput = z.infer<typeof availabilityWindowSchema>;
export type PublicContactInput = z.infer<typeof publicContactSchema>;
export type PublicLeadCaptureInput = z.infer<typeof publicLeadCaptureSchema>;
export type PublicQualificationInput = z.infer<typeof publicQualificationSchema>;
export type PublicBookingRequest = z.infer<typeof publicBookingRequestSchema>;
export type PublicLeadTouchInput = z.infer<typeof publicLeadTouchSchema>;

export function isValidPhoneNumber(phone: string): boolean {
  const parsed = parsePhoneNumberFromString(phone, "FR");
  return Boolean(parsed?.isValid());
}

export function normalizePhone(phone: string, defaultCountry: CountryCode = "FR"): string {
  const parsed = parsePhoneNumberFromString(phone.trim(), defaultCountry);
  return parsed?.number ?? phone.trim().replace(/[\s().-]/g, "");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugifyEventName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return slug || "appel-strategique";
}

export function sanitizeUtm(input: Record<string, string> | undefined): Record<string, string> {
  if (!input) return {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => key.startsWith("utm_") && value.trim().length > 0)
      .slice(0, 20)
      .map(([key, value]) => [key, value.trim().slice(0, 500)])
  );
}
