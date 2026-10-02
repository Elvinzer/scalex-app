export type CrmDateStyle = "short" | "medium";

function formatDateParts(date: Date, locale: string, timeZone: string, dateStyle: CrmDateStyle): string {
  const isFrench = locale.toLowerCase().startsWith("fr");
  const parts = new Intl.DateTimeFormat(locale, { dateStyle, timeZone }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? "";
  const day = part("day");
  const month = part("month");
  const year = part("year");

  if (dateStyle === "short") return isFrench ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
  return isFrench ? `${day} ${month} ${year}` : `${month} ${day}, ${year}`;
}

export function formatCrmDate(date: Date, locale: string, timeZone: string, dateStyle: CrmDateStyle = "medium"): string {
  return formatDateParts(date, locale, timeZone, dateStyle);
}

export function formatCrmDateTime(date: Date, locale: string, timeZone: string, dateStyle: CrmDateStyle = "medium"): string {
  const isFrench = locale.toLowerCase().startsWith("fr");
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: isFrench ? "h23" : "h12",
    timeZone,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? "";
  const hour = part("hour");
  const minute = part("minute");
  const dayPeriod = part("dayPeriod");
  const time = isFrench ? `${hour}:${minute}` : `${hour}:${minute}${dayPeriod ? ` ${dayPeriod}` : ""}`;
  const separator = isFrench ? " à " : ", ";

  return `${formatDateParts(date, locale, timeZone, dateStyle)}${separator}${time}`;
}
