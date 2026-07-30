import { normalizeScheduledEvent, type NormalizedCalendlyCall } from "./events";
import { CALENDLY_API_BASE, CALENDLY_ENDPOINTS, CALENDLY_WEBHOOK_EVENTS } from "./protocol";

// Server-only HTTP client for the Calendly API v2. Auth is the client's Personal
// Access Token (BYOK), passed in decrypted at the call site, never logged.

const REQUEST_TIMEOUT_MS = 15_000;

type CalendlyResponse = { status: number; body: unknown };

async function request(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> }
): Promise<CalendlyResponse> {
  const url = new URL(path, CALENDLY_API_BASE);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
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

export type CalendlyCheck =
  | { status: "valid"; userUri: string; orgUri: string }
  | { status: "invalid" }
  | { status: "no_access" }
  | { status: "unknown" };

// Validates a token AND resolves the user + organization URIs (needed to scope
// every other call), via GET /users/me.
export async function validateCalendlyToken(token: string): Promise<CalendlyCheck> {
  try {
    const { status, body } = await request(token, CALENDLY_ENDPOINTS.me);
    if (status === 401) return { status: "invalid" };
    if (status === 403) return { status: "no_access" };
    if (status < 200 || status >= 300) return { status: "unknown" };
    const resource = asRecord(asRecord(body)?.resource) ?? {};
    const userUri = str(resource.uri);
    const orgUri = str(resource.current_organization);
    if (!userUri || !orgUri) return { status: "unknown" };
    return { status: "valid", userUri, orgUri };
  } catch {
    return { status: "unknown" };
  }
}

export class CalendlyNoAccessError extends Error {
  constructor() {
    super("Calendly API access is not available for this account (a paid Calendly plan is required).");
    this.name = "CalendlyNoAccessError";
  }
}

// Backfill: scheduled events (last 12 months, capped) enriched with their first
// invitee (name/email live on a separate resource). Returns normalized calls.
export async function listScheduledCalls(
  token: string,
  userUri: string,
  opts?: { maxEvents?: number; monthsBack?: number }
): Promise<NormalizedCalendlyCall[]> {
  const maxEvents = opts?.maxEvents ?? 200;
  const minStart = new Date();
  minStart.setMonth(minStart.getMonth() - (opts?.monthsBack ?? 12));

  const events: Record<string, unknown>[] = [];
  let pageToken: string | null = null;
  while (events.length < maxEvents) {
    const query: Record<string, string> = {
      user: userUri,
      count: "100",
      sort: "start_time:desc",
      min_start_time: minStart.toISOString(),
    };
    if (pageToken) query.page_token = pageToken;

    const { status, body } = await request(token, CALENDLY_ENDPOINTS.scheduledEvents, { query });
    if (status === 403) throw new CalendlyNoAccessError();
    if (status < 200 || status >= 300) throw new Error(`Calendly scheduled_events failed (status ${status})`);

    const rec = asRecord(body) ?? {};
    const collection = Array.isArray(rec.collection) ? rec.collection : [];
    for (const e of collection) if (asRecord(e)) events.push(e as Record<string, unknown>);
    pageToken = str(asRecord(rec.pagination)?.next_page_token);
    if (!pageToken || collection.length === 0) break;
  }

  const calls: NormalizedCalendlyCall[] = [];
  for (const event of events.slice(0, maxEvents)) {
    const invitee = await fetchFirstInvitee(token, str(event.uri));
    const normalized = normalizeScheduledEvent(event, invitee);
    if (normalized) calls.push(normalized);
  }
  return calls;
}

async function fetchFirstInvitee(token: string, eventUri: string | null): Promise<Record<string, unknown> | null> {
  if (!eventUri) return null;
  const uuid = eventUri.split("/").pop();
  if (!uuid) return null;
  const { status, body } = await request(token, `${CALENDLY_ENDPOINTS.scheduledEvents}/${uuid}/invitees`, {
    query: { count: "1" },
  });
  if (status < 200 || status >= 300) return null;
  const collection = Array.isArray(asRecord(body)?.collection) ? (asRecord(body)!.collection as unknown[]) : [];
  return asRecord(collection[0]);
}

type RegisteredWebhook = { id: string | null; signingKey: string | null };

export async function registerWebhook(
  token: string,
  params: { url: string; orgUri: string; userUri: string; signingKey: string }
): Promise<RegisteredWebhook> {
  const { status, body } = await request(token, CALENDLY_ENDPOINTS.webhookSubscriptions, {
    method: "POST",
    body: {
      url: params.url,
      events: CALENDLY_WEBHOOK_EVENTS,
      organization: params.orgUri,
      user: params.userUri,
      scope: "user",
      signing_key: params.signingKey,
    },
  });
  if (status === 403) throw new CalendlyNoAccessError();
  if (status < 200 || status >= 300) throw new Error(`Calendly webhook subscribe failed (status ${status})`);
  const resource = asRecord(asRecord(body)?.resource) ?? {};
  return { id: str(resource.uri), signingKey: str(resource.signing_key) ?? params.signingKey };
}

export async function deleteWebhook(token: string, webhookUri: string): Promise<void> {
  const uuid = webhookUri.split("/").pop();
  if (!uuid) return;
  await request(token, `${CALENDLY_ENDPOINTS.webhookSubscriptions}/${uuid}`, { method: "DELETE" });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
