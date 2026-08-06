type IcsDetails = {
  uid: string;
  startAt: Date;
  endAt: Date;
  title: string;
  timeZone: string;
  closerName: string;
  instructions: string;
  meetingUrl: string | null;
};

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function formatUtc(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function createNativeBookingIcs(details: IcsDetails): string {
  const description = [
    `Closer : ${details.closerName}`,
    details.instructions ? `Consignes : ${details.instructions}` : "",
    details.meetingUrl ? `Lien de réunion : ${details.meetingUrl}` : "",
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scale X//Native booking//FR",
    "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${escapeIcs(details.timeZone)}`,
    "BEGIN:VEVENT",
    `UID:${escapeIcs(details.uid)}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(details.startAt)}`,
    `DTEND:${formatUtc(details.endAt)}`,
    `SUMMARY:${escapeIcs(details.title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    ...(details.meetingUrl ? [`URL:${escapeIcs(details.meetingUrl)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}
