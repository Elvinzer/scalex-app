import { readCall, type NormalizedCall } from "./events";
import { ICLOSED_API_BASE, ICLOSED_ENDPOINTS, ICLOSED_KEY_PREFIX, ICLOSED_WEBHOOK_EVENTS } from "./protocol";

// Thin server-only HTTP client for iClosed's public REST API. Auth is a static
// Bearer API key the CLIENT brings (BYOK) — never our own. The key is decrypted
// from iclosed_connections at the call site and passed in; it is never logged.

const REQUEST_TIMEOUT_MS = 10_000;

type IclosedResponse = { status: number; body: unknown };

async function request(
  apiKey: string,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> }
): Promise<IclosedResponse> {
  const url = new URL(path, ICLOSED_API_BASE);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

// Same three-state contract as validateAnthropicKey: never conflate "the key is
// wrong" (block the user) with "iClosed is briefly unreachable" (ask to retry).
export async function validateIclosedKey(apiKey: string): Promise<"valid" | "invalid" | "unknown"> {
  if (!apiKey.startsWith(ICLOSED_KEY_PREFIX)) return "invalid";
  try {
    const { status } = await request(apiKey, ICLOSED_ENDPOINTS.validate);
    if (status === 401 || status === 403) return "invalid";
    if (status >= 200 && status < 300) return "valid";
    // 404 on the probe endpoint means the key authenticated but the path
    // differs — treat as valid rather than locking the user out over a path
    // guess (⚠️ tighten once ICLOSED_ENDPOINTS.validate is confirmed).
    if (status === 404) return "valid";
    return "unknown";
  } catch {
    return "unknown";
  }
}

type RegisteredWebhook = { id: string | null; secret: string | null };

// Registers our webhook endpoint on iClosed for the booking lifecycle events.
// Returns the created webhook's id (to delete later) and a signing secret if
// iClosed hands one back (used as an extra HMAC verification layer).
export async function registerWebhook(apiKey: string, deliveryUrl: string): Promise<RegisteredWebhook> {
  const { status, body } = await request(apiKey, ICLOSED_ENDPOINTS.webhooks, {
    method: "POST",
    body: {
      url: deliveryUrl,
      events: Object.values(ICLOSED_WEBHOOK_EVENTS),
    },
  });
  if (status < 200 || status >= 300) {
    throw new Error(`iClosed webhook registration failed (status ${status})`);
  }
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const id = typeof rec.id === "string" ? rec.id : typeof rec.id === "number" ? String(rec.id) : null;
  const secret = typeof rec.secret === "string" ? rec.secret : typeof rec.signingSecret === "string" ? rec.signingSecret : null;
  return { id, secret };
}

// Best-effort — a failure here must never block clearing our local connection
// (same rule as disconnectStripe's oauth.deauthorize).
export async function deleteWebhook(apiKey: string, webhookId: string): Promise<void> {
  await request(apiKey, `${ICLOSED_ENDPOINTS.webhooks}/${webhookId}`, { method: "DELETE" });
}

// Backfill: pulls recent + upcoming calls so the tab isn't empty before the
// first live webhook arrives. Reads defensively (the list may be the array
// itself or wrapped under data/results/items) and normalizes each item.
export async function listCalls(apiKey: string, limit = 100): Promise<NormalizedCall[]> {
  const { status, body } = await request(apiKey, ICLOSED_ENDPOINTS.calls, {
    query: { limit: String(limit) },
  });
  if (status < 200 || status >= 300) {
    throw new Error(`iClosed calls list failed (status ${status})`);
  }
  const items = extractList(body);
  const calls: NormalizedCall[] = [];
  for (const item of items) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const normalized = readCall(item as Record<string, unknown>);
      if (normalized) calls.push(normalized);
    }
  }
  return calls;
}

function extractList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  for (const key of ["data", "results", "items", "calls"]) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
  }
  return [];
}
