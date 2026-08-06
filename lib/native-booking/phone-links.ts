const DEFAULT_COUNTRY_CALLING_CODE = "33";

/**
 * Returns a phone number suitable for tel:/wa.me links.
 * Existing booking records may contain either E.164, international digits,
 * or a French national number, so the leading + is restored here.
 */
export function internationalPhoneForLink(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  const internationalDigits = trimmed.startsWith("00")
    ? digits.slice(2)
    : trimmed.startsWith("+")
      ? digits
      : digits.startsWith("0")
        ? `${DEFAULT_COUNTRY_CALLING_CODE}${digits.slice(1)}`
        : digits;

  return internationalDigits ? `+${internationalDigits}` : null;
}

export function phoneHref(value: string | null | undefined): string | null {
  const phone = internationalPhoneForLink(value);
  return phone ? `tel:${phone}` : null;
}

export function whatsappHref(value: string | null | undefined, message?: string): string | null {
  const phone = internationalPhoneForLink(value);
  if (!phone) return null;
  return `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
