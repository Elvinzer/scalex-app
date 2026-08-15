import { getAppUrl } from "@/lib/utils";

import type { SupportTicketContext, SupportTicketPriority, SupportTicketStatus, SupportTicketType } from "@/lib/support/types";

const DISCORD_WEBHOOK_PATTERN = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/[\w-]+\/[\w-]+/;

export type SupportDiscordTicket = {
  id: string;
  reference: string;
  type: SupportTicketType;
  title: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  requesterName: string | null;
  requesterEmail: string;
  accountName: string | null;
  context: SupportTicketContext;
  hasCapture: boolean;
};

export type SupportDiscordResult =
  | { status: "sent"; messageId: string | null }
  | { status: "not_configured" }
  | { status: "failed"; errorCode: string };

const MAX_FIELD_LENGTH = 900;

function truncate(value: string, max = MAX_FIELD_LENGTH): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function neutralizeDiscordMentions(value: string): string {
  return value.replaceAll("@", "@\u200b");
}

function safe(value: string | null | undefined): string {
  return neutralizeDiscordMentions(value?.trim() || "Non renseigné");
}

export async function sendSupportDiscordTicket(ticket: SupportDiscordTicket): Promise<SupportDiscordResult> {
  const configuredWebhook = process.env.SUPPORT_DISCORD_WEBHOOK_URL?.trim();
  if (!configuredWebhook) return { status: "not_configured" };
  if (!DISCORD_WEBHOOK_PATTERN.test(configuredWebhook)) return { status: "failed", errorCode: "invalid_webhook" };

  const adminUrl = `${getAppUrl()}/admin/support/${encodeURIComponent(ticket.id)}`;
  const payload = {
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: `${safe(ticket.reference)} · Nouveau ticket`,
        url: adminUrl,
        description: truncate(safe(ticket.description), 1_500),
        color: 0xf16b45,
        fields: [
          { name: "Type", value: safe(ticket.type), inline: true },
          { name: "Titre", value: safe(ticket.title), inline: false },
          { name: "Priorité", value: safe(ticket.priority), inline: true },
          { name: "Statut", value: safe(ticket.status), inline: true },
          { name: "Demandeur", value: `${safe(ticket.requesterName)}\n${safe(ticket.requesterEmail)}`, inline: true },
          { name: "Compte", value: safe(ticket.accountName), inline: true },
          { name: "Écran", value: safe(ticket.context.pathname), inline: true },
          { name: "Capture", value: ticket.hasCapture ? "Oui, disponible dans la fiche Admin" : "Aucune", inline: true },
        ],
        footer: { text: "Minaly Support" },
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${configuredWebhook}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return { status: "failed", errorCode: `http_${response.status}` };
    let messageId: string | null = null;
    try {
      const body: unknown = await response.json();
      if (typeof body === "object" && body !== null && "id" in body && typeof body.id === "string") {
        messageId = body.id;
      }
    } catch {
      // Discord may acknowledge without a JSON body. The delivery still
      // succeeded, so do not turn it into a false failure.
    }
    return { status: "sent", messageId };
  } catch (error) {
    return { status: "failed", errorCode: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendSupportDiscordReply(input: {
  reference: string;
  ticketId: string;
  requesterName: string | null;
  body: string;
}): Promise<SupportDiscordResult> {
  const configuredWebhook = process.env.SUPPORT_DISCORD_WEBHOOK_URL?.trim();
  if (!configuredWebhook) return { status: "not_configured" };
  if (!DISCORD_WEBHOOK_PATTERN.test(configuredWebhook)) return { status: "failed", errorCode: "invalid_webhook" };

  const payload = {
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: `${safe(input.reference)} · Réponse utilisateur`,
        url: `${getAppUrl()}/admin/support/${encodeURIComponent(input.ticketId)}`,
        description: truncate(`${safe(input.requesterName)} a ajouté une réponse.\n\n${safe(input.body)}`),
        color: 0x7666e8,
        footer: { text: "Minaly Support" },
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${configuredWebhook}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok ? { status: "sent", messageId: null } : { status: "failed", errorCode: `http_${response.status}` };
  } catch (error) {
    return { status: "failed", errorCode: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timeout);
  }
}
