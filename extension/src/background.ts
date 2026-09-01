const minalyProductionOrigin = "https://minaly.app";
const minalyDevelopmentOrigin = "http://localhost:3000";
const minalyBackgroundOriginKey = "minalyCrmExtensionOrigin";
const minalyBackgroundTokenKey = "minalyCrmExtensionToken";
const minalyBackgroundPaths = new Set([
  "/api/crm/extension/session",
  "/api/crm/extension/resolve",
  "/api/crm/extension/capture",
  "/api/crm/extension/update",
]);

type MinalyBackgroundRequest = { type: "minaly-api-request"; path: string; payload?: unknown };

async function minalyBackgroundOrigin(): Promise<string> {
  const values = await chrome.storage.local.get([minalyBackgroundOriginKey]);
  return values[minalyBackgroundOriginKey] === minalyDevelopmentOrigin ? minalyDevelopmentOrigin : minalyProductionOrigin;
}

async function minalyBackgroundSession(): Promise<string | null> {
  const preferredOrigin = await minalyBackgroundOrigin();
  const origins = preferredOrigin === minalyProductionOrigin ? [minalyProductionOrigin, minalyDevelopmentOrigin] : [minalyDevelopmentOrigin, minalyProductionOrigin];
  for (const origin of origins) {
    let response: Response;
    try {
      response = await fetch(`${origin}/api/crm/extension/session`, { method: "POST", credentials: "include" });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const body: unknown = await response.json().catch(() => null);
    if (typeof body !== "object" || body === null) continue;
    const data = "data" in body && typeof body.data === "object" && body.data !== null ? body.data : body;
    if (!("extensionToken" in data) && !("token" in data)) continue;
    const token = "extensionToken" in data && typeof data.extensionToken === "string" ? data.extensionToken : "token" in data && typeof data.token === "string" ? data.token : null;
    if (!token) continue;
    await chrome.storage.local.set({ [minalyBackgroundTokenKey]: token, [minalyBackgroundOriginKey]: origin });
    return token;
  }
  return null;
}

async function minalyBackgroundRequest(message: MinalyBackgroundRequest): Promise<{ status: number; body: unknown }> {
  if (!minalyBackgroundPaths.has(message.path)) return { status: 400, body: { error: "invalid_path" } };
  let origin = await minalyBackgroundOrigin();
  const values = await chrome.storage.local.get([minalyBackgroundTokenKey]);
  let token = typeof values[minalyBackgroundTokenKey] === "string" ? values[minalyBackgroundTokenKey] : await minalyBackgroundSession();
  const request = async (requestOrigin: string, bearer: string | null) => fetch(`${requestOrigin}${message.path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(message.payload ?? {}),
  });
  origin = await minalyBackgroundOrigin();
  let response = await request(origin, token);
  if (response.status === 401 && message.path !== "/api/crm/extension/session") {
    await chrome.storage.local.remove([minalyBackgroundTokenKey]);
    token = await minalyBackgroundSession();
    origin = await minalyBackgroundOrigin();
    response = await request(origin, token);
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (typeof message !== "object" || message === null || !("type" in message)) return;
  const type = (message as { type?: unknown }).type;
  if (type === "minaly-open-auth") {
    void minalyBackgroundOrigin().then((origin) => chrome.tabs.create({ url: `${origin}/sign-in?next=/crm` }));
    return;
  }
  if (type === "minaly-api-request") {
    void minalyBackgroundRequest(message as MinalyBackgroundRequest).then(sendResponse).catch(() => sendResponse({ status: 503, body: { error: "network_error" } }));
    return true;
  }
});
