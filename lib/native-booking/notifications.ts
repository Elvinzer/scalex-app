import { getResendClient, isResendConfigured } from "@/lib/resend-client";

export async function sendNativeBookingConfirmation({
  to,
  firstName,
  eventName,
  meetingLabel,
  startAt,
  endAt,
  timeZone,
  closerName,
  meetingUrl,
}: {
  to: string;
  firstName: string;
  eventName: string;
  meetingLabel: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  closerName: string;
  meetingUrl: string | null;
}) {
  if (!isResendConfigured()) return;

  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    dateStyle: "full",
  });
  const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateLabel = dateFormatter.format(startAt);
  const timeLabel = `${timeFormatter.format(startAt)} – ${timeFormatter.format(endAt)}`;
  const joinLine = meetingUrl ? `\nLien pour rejoindre l'appel : ${meetingUrl}` : "";

  await getResendClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Scale X <hello@scalex.app>",
    to,
    subject: `${meetingLabel} confirmé — ${dateLabel}`,
    text: [
      `Bonjour ${firstName},`,
      "",
      `Ton rendez-vous « ${eventName} » est confirmé.`,
      `${dateLabel} · ${timeLabel} (${timeZone})`,
      `Avec ${closerName}.`,
      joinLine,
      "",
      "À bientôt,",
      "Scale X",
    ].filter(Boolean).join("\n"),
  });
}
