// Legacy OpenAI-compatible provider used by the content/advice endpoints and
// as Falco's last-resort fallback. Falco prefers the current user's Anthropic
// BYOK key; this config stays generic so the remaining endpoints can keep
// talking to `baseURL`/`model`/`apiKey` without provider-specific code.
//
// This reads one shared server Groq key for endpoints that do not yet use the
// Anthropic BYOK resolver. Never exposed to the client.
export type AiProviderConfig = {
  baseURL: string;
  model: string;
  apiKey: string;
};

export function getAiProvider(): AiProviderConfig {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  return {
    baseURL: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-120b",
    apiKey,
  };
}
