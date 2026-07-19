// Single point of change to swap the "Améliorer" chat's provider (Gemini,
// OpenAI, Anthropic...) — everything else in this feature talks to
// `baseURL`/`model`/`apiKey` generically via the OpenAI-compatible chat
// completions shape, never to "Groq" by name.
//
// Deliberate BYOK exception: unlike lib/agent/client.ts's resolveAgentKey
// (BYOK-first, per-user Anthropic key), this reads one shared server key for
// every user. Scoped to this one advice-chat feature only — see the plan
// doc for why. Never exposed to the client.
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
    model: "llama-3.3-70b-versatile",
    apiKey,
  };
}
