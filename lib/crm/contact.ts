import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.max";

export type CrmPhoneNormalization = {
  normalized: string | null;
  reason: "missing" | "invalid" | null;
};

export function normalizePhoneForCountry(raw: string | null | undefined, country?: CountryCode): CrmPhoneNormalization {
  const value = raw?.trim() ?? "";
  if (!value) return { normalized: null, reason: "missing" };
  const parsed = country
    ? parsePhoneNumberFromString(value, country, metadata)
    : parsePhoneNumberFromString(value, { extract: false }, metadata);
  if (!parsed?.isValid()) return { normalized: null, reason: "invalid" };
  return { normalized: parsed.number, reason: null };
}

export function whatsappHrefFromNormalizedPhone(phone: string | null | undefined): string | null {
  const value = phone?.trim() ?? "";
  if (!/^\+[1-9]\d{6,14}$/.test(value)) return null;
  const normalized = normalizePhoneForCountry(value).normalized;
  if (normalized !== value) return null;
  return `https://wa.me/${normalized.slice(1)}`;
}

/**
 * Reads a legacy WhatsApp click-to-chat URL as a phone identity.
 * Legacy CRM rows used this URL as their profile URL, so keeping this
 * conversion in the shared identity helpers lets matching and migration use
 * the same validation rules as the generated link.
 */
export function normalizedPhoneFromWhatsAppUrl(rawUrl: string | null | undefined): string | null {
  const value = rawUrl?.trim() ?? "";
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if ((url.protocol !== "https:" && url.protocol !== "http:") || hostname !== "wa.me" || url.username || url.password || url.port) return null;
    const digits = url.pathname.replace(/^\/+|\/+$/g, "").replace(/^\+/, "");
    if (!/^\d{7,15}$/.test(digits) || digits.startsWith("0")) return null;
    return normalizePhoneForCountry(`+${digits}`).normalized;
  } catch {
    return null;
  }
}

export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase("en-US") ?? "";
  return normalized || null;
}
