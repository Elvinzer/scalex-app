import { Resend } from "resend";

import { requireEnv } from "@/lib/utils";

let client: Resend | null = null;

export function getResendClient(): Resend {
  if (!client) {
    client = new Resend(requireEnv("RESEND_API_KEY"));
  }
  return client;
}

/**
 * True si Resend est configuré. Permet aux flows qui envoient un email
 * transactionnel (invitation d'équipe) de dégrader proprement en dev, où
 * RESEND_API_KEY n'est pas forcément renseignée, plutôt que de crasher.
 */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
