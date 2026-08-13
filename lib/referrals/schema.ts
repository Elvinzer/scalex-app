import { z } from "zod";

export const REFERRAL_COOKIE_NAME = "minaly_referral_code";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
export const DEFAULT_REFERRAL_SETTINGS_ID = "default";
export const MAX_COMMISSION_RATE_BPS = 10_000;

export const referralCodeSchema = z
  .string()
  .trim()
  .min(4, "Le code doit contenir au moins 4 caractères")
  .max(32, "Le code ne peut pas dépasser 32 caractères")
  .regex(/^[a-zA-Z0-9_-]+$/, "Utilise uniquement des lettres, chiffres, tirets ou underscores")
  .transform((value) => value.toUpperCase());

export const referralRateBpsSchema = z
  .number()
  .int("Le pourcentage doit être un nombre entier de centièmes")
  .min(0, "Le pourcentage ne peut pas être négatif")
  .max(MAX_COMMISSION_RATE_BPS, "Le pourcentage ne peut pas dépasser 100 %");

export const referralCodeInputSchema = z.object({
  code: referralCodeSchema,
});

export const referralSettingsInputSchema = z.object({
  isEnabled: z.boolean(),
  defaultCommissionRateBps: referralRateBpsSchema,
});

export const referralOverrideInputSchema = z.object({
  codeId: z.string().uuid("Code de parrainage invalide"),
  commissionRateBps: referralRateBpsSchema.nullable(),
});

export const referralPayoutInputSchema = z.object({
  referrerAccountId: z.string().uuid("Compte parrain invalide"),
  currency: z.string().regex(/^[a-zA-Z]{3}$/, "Devise invalide").transform((value) => value.toLowerCase()),
  externalReference: z.string().trim().max(120, "Référence trop longue").nullable(),
  note: z.string().trim().max(500, "Note trop longue").nullable(),
});

export type ReferralCodeInput = z.infer<typeof referralCodeInputSchema>;
export type ReferralSettingsInput = z.infer<typeof referralSettingsInputSchema>;
export type ReferralOverrideInput = z.infer<typeof referralOverrideInputSchema>;
export type ReferralPayoutInput = z.infer<typeof referralPayoutInputSchema>;

export function calculateCommission(eligibleAmountCents: number, commissionRateBps: number): number {
  if (!Number.isInteger(eligibleAmountCents) || eligibleAmountCents <= 0) return 0;
  if (!Number.isInteger(commissionRateBps) || commissionRateBps <= 0) return 0;
  return Math.floor((eligibleAmountCents * commissionRateBps) / 10_000);
}

export function formatRateBps(rateBps: number): string {
  const percentage = rateBps / 100;
  return Number.isInteger(percentage) ? `${percentage} %` : `${percentage.toFixed(2).replace(/0+$/, "")} %`;
}
