import { z } from "zod";

import { isValidTimeZone, minutesFromTime } from "./time";

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide");

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
  meetingUrl: z.string().trim().url("Lien de réunion invalide").nullable(),
  publicHeading: z.string().trim().min(2).max(120),
  publicDescription: z.string().trim().max(300),
  confirmationTitle: z.string().trim().min(2).max(120).default("Rendez-vous confirmé"),
  confirmationMessage: z.string().trim().max(300).default("Ton closer te recontactera pour la suite."),
  bookingInstructions: z.string().trim().max(1000).default(""),
  notifyCloserOnBooking: z.boolean().default(true),
  notifyCloserOnCancellation: z.boolean().default(true),
  notifyCloserOnReschedule: z.boolean().default(true),
  requireContactBeforeSlots: z.boolean(),
  roundRobinEnabled: z.boolean(),
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
  phone: z.string().trim().min(7, "Numéro de téléphone invalide").max(40),
  guestTimeZone: z.string().refine(isValidTimeZone, "Fuseau horaire invalide"),
  leadSessionKey: z.string().uuid().nullable().default(null),
  landingPage: z.string().url().nullable().default(null),
  referrer: z.string().url().nullable().default(null),
  linkId: z.string().uuid().nullable().default(null),
  utm: z.record(z.string().max(500)).default({}),
});

export const publicLeadCaptureSchema = z
  .object({
    firstName: z.string().trim().max(80).default(""),
    lastName: z.string().trim().max(80).default(""),
    phone: z.string().trim().max(40).default(""),
    guestTimeZone: z.string().refine(isValidTimeZone, "Fuseau horaire invalide"),
    leadSessionKey: z.string().uuid().nullable().default(null),
    landingPage: z.string().url().nullable().default(null),
    referrer: z.string().url().nullable().default(null),
    linkId: z.string().uuid().nullable().default(null),
    utm: z.record(z.string().max(500)).default({}),
  })
  .refine((value) => Boolean(value.firstName || value.lastName || value.phone), {
    message: "Renseigne au moins une information.",
    path: ["firstName"],
  });

export const publicBookingRequestSchema = publicContactSchema.extend({
  startAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  leadId: z.string().uuid().nullable().default(null),
});

const bookingManagementTokenSchema = z.string().trim().min(32).max(128);

export const publicBookingCancelSchema = z.object({ token: bookingManagementTokenSchema });

export const publicBookingRescheduleSlotsSchema = z.object({ token: bookingManagementTokenSchema });

export const publicBookingRescheduleSchema = z.object({
  token: bookingManagementTokenSchema,
  startAt: z.string().datetime({ offset: true }),
});

export const publicLeadTouchSchema = publicContactSchema.extend({
  leadId: z.string().uuid(),
  lastStep: z.enum(["slots_revealed", "slot_selected", "booking_failed"]),
  startAt: z.string().datetime({ offset: true }).nullable().default(null),
});

export type NativeBookingEventInput = z.infer<typeof nativeBookingEventInputSchema>;
export type AvailabilityWindowInput = z.infer<typeof availabilityWindowSchema>;
export type PublicContactInput = z.infer<typeof publicContactSchema>;
export type PublicLeadCaptureInput = z.infer<typeof publicLeadCaptureSchema>;
export type PublicBookingRequest = z.infer<typeof publicBookingRequestSchema>;
export type PublicLeadTouchInput = z.infer<typeof publicLeadTouchSchema>;

export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s().-]/g, "");
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
