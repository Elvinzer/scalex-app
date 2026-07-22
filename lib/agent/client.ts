import { decrypt } from "@/lib/crypto";

import { checkAndIncrementSharedUsage } from "./quota";

export type AgentKey = { source: "byok" | "shared"; apiKey: string };

export class NoAgentKeyAvailableError extends Error {
  constructor() {
    super("Aucune clé Anthropic disponible. Ajoute ta clé dans Réglages.");
    this.name = "NoAgentKeyAvailableError";
  }
}

// Resolves which Anthropic key an agent call should use for this user — BYOK
// first, shared fallback second (CLAUDE.md's amended BYOK rule). Never
// returns the shared key without first checking (and incrementing) the
// user's shared-key quota, so cost exposure on the fallback is tracked from
// the very first call, even while the quota itself is unlimited.
export async function resolveAgentKey(user: {
  id: string;
  anthropicApiKeyEncrypted: string | null;
}): Promise<AgentKey> {
  if (user.anthropicApiKeyEncrypted) {
    return { source: "byok", apiKey: decrypt(user.anthropicApiKeyEncrypted) };
  }

  const sharedKey = process.env.ANTHROPIC_SHARED_API_KEY;
  if (!sharedKey) {
    throw new NoAgentKeyAvailableError();
  }

  await checkAndIncrementSharedUsage(user.id);
  return { source: "shared", apiKey: sharedKey };
}
