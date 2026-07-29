import { readCall, type NormalizedCall } from "./events";
import { ICLOSED_API_BASE, ICLOSED_ENDPOINTS, ICLOSED_KEY_PREFIX } from "./protocol";

// Thin server-only HTTP client for iClosed's public REST API. Auth is a static
// Bearer API key the CLIENT brings (BYOK) — never our own. The key is decrypted
// from iclosed_connections at the call site and passed in; it is never logged.

const REQUEST_TIMEOUT_MS = 15_000;

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

// Four-state result: distinguishes a wrong key (401) from a valid key on a
// plan without API access (400 "Bad request"), which is a common, actionable
// case worth its own message ("upgrade your iClosed plan"), from a transient
// network problem (unknown).
export type KeyCheck = "valid" | "invalid" | "no_api_access" | "unknown";

export async function validateIclosedKey(apiKey: string): Promise<KeyCheck> {
  if (!apiKey.startsWith(ICLOSED_KEY_PREFIX)) return "invalid";
  try {
    const { status } = await request(apiKey, ICLOSED_ENDPOINTS.eventCalls, {
      query: { eventType: "ALL", limit: "1", page: "0" },
    });
    if (status >= 200 && status < 300) return "valid";
    if (status === 401) return "invalid";
    // Authenticates but the account/plan can't use the API — see protocol.ts.
    if (status === 400 || status === 403) return "no_api_access";
    return "unknown";
  } catch {
    return "unknown";
  }
}

// Backfill: pulls calls (paginated) from GET /v1/eventCalls. Response shape:
// { data: { eventCalls: [...], count } }. Normalizes each item via readCall.
export async function listCalls(apiKey: string, maxPages = 10, pageSize = 100): Promise<NormalizedCall[]> {
  const calls: NormalizedCall[] = [];
  for (let page = 0; page < maxPages; page++) {
    const { status, body } = await request(apiKey, ICLOSED_ENDPOINTS.eventCalls, {
      query: { eventType: "ALL", limit: String(pageSize), page: String(page) },
    });
    if (status === 400 || status === 403) {
      throw new IclosedNoApiAccessError();
    }
    if (status < 200 || status >= 300) {
      throw new Error(`iClosed eventCalls list failed (status ${status})`);
    }
    const { items, count } = extractEventCalls(body);
    for (const item of items) {
      const normalized = readCall(item);
      if (normalized) calls.push(normalized);
    }
    if (items.length === 0 || calls.length >= count) break;
  }
  return calls;
}

// Thrown when the account authenticates but the API rejects every call (plan
// gate) — lets the caller surface a plan-specific message instead of a generic
// "sync failed".
export class IclosedNoApiAccessError extends Error {
  constructor() {
    super("iClosed API access is not enabled for this account (Business/Enterprise plan required).");
    this.name = "IclosedNoApiAccessError";
  }
}

function extractEventCalls(body: unknown): { items: Record<string, unknown>[]; count: number } {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>).data : null;
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rawItems = Array.isArray(rec.eventCalls) ? rec.eventCalls : [];
  const items = rawItems.filter(
    (i): i is Record<string, unknown> => i !== null && typeof i === "object" && !Array.isArray(i)
  );
  const count = typeof rec.count === "number" ? rec.count : items.length;
  return { items, count };
}
