import Anthropic from "@anthropic-ai/sdk";

export type KeyValidationResult = "valid" | "invalid" | "unknown";

// models.list() is a free, auth-only call (no tokens spent) — the cheapest
// real call that proves a key actually works against Anthropic's API.
// "unknown" covers network blips / rate limits / 5xx: never treat those as a
// bad key, only a confirmed 401 does.
export async function validateAnthropicKey(apiKey: string): Promise<KeyValidationResult> {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  try {
    await client.models.list({ limit: 1 });
    return "valid";
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return "invalid";
    return "unknown";
  }
}
