import { Resend } from "resend";

import { requireEnv } from "@/lib/utils";

let client: Resend | null = null;

export function getResendClient(): Resend {
  if (!client) {
    client = new Resend(requireEnv("RESEND_API_KEY"));
  }
  return client;
}
