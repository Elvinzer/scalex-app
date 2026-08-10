export function formatReferralMoney(cents: number, currency: string, locale = "fr-FR"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function maskReferralEmail(email: string): string {
  const [localPart, domain] = email.split("@", 2);
  if (!localPart || !domain) return email;
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${"•".repeat(Math.max(1, localPart.length - visible.length))}@${domain}`;
}

export function formatReferralDate(value: Date, locale = "fr-FR"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(value);
}
