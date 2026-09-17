const minalyProductionOrigin = "https://www.minaly.io";
const minalyDevelopmentOrigin = "http://localhost:3000";
const minalyBackgroundOriginKey = "minalyCrmExtensionOrigin";
const minalyBackgroundTokenKey = "minalyCrmExtensionToken";
const minalyBackgroundAuthStateKey = "minalyCrmExtensionAuthState";
const minalyBackgroundAuthTabKey = "minalyCrmExtensionAuthTab";
const minalyBackgroundPendingUpdateKey = "minalyCrmExtensionPendingUpdate";
const minalyBackgroundReleaseCacheKey = "minalyCrmExtensionReleaseCache";
const minalyBackgroundReleaseCacheTtlMs = 5 * 60_000;
const minalyBackgroundPaths = new Set([
  "/api/crm/extension/session",
  "/api/crm/extension/resolve",
  "/api/crm/extension/capture",
  "/api/crm/extension/update",
]);

type MinalyBackgroundRequest = { type: "minaly-api-request"; path: string; payload?: unknown };
type MinalyAuthCallback = { state: string; token: string | null; error: string | null };
type MinalyBackgroundUpdate = {
  latestVersion: string;
  updateUrl: string | null;
  distribution: "web_store" | "pilot_package";
  downloaded: boolean;
};

function minalyBackgroundIsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function minalyReadBackgroundRequest(value: unknown): MinalyBackgroundRequest | null {
  if (!minalyBackgroundIsRecord(value) || value.type !== "minaly-api-request" || typeof value.path !== "string" || !minalyBackgroundPaths.has(value.path)) return null;
  return { type: "minaly-api-request", path: value.path, payload: value.payload };
}

function minalyReadAuthCallback(value: unknown): MinalyAuthCallback | null {
  if (!minalyBackgroundIsRecord(value) || typeof value.state !== "string" || value.state.length < 16 || value.state.length > 128) return null;
  const token = typeof value.token === "string" && value.token.length > 0 && value.token.length <= 2048 ? value.token : null;
  const error = typeof value.error === "string" && value.error.length > 0 && value.error.length <= 80 ? value.error : null;
  if ((token === null && error === null) || (token !== null && error !== null)) return null;
  return { state: value.state, token, error };
}

function minalyBackgroundVersion(value: unknown): string | null {
  return typeof value === "string" && /^(?:\d{1,4})(?:\.\d{1,4}){0,3}$/.test(value) ? value : null;
}

function minalyBackgroundCompareVersions(left: string, right: string): -1 | 0 | 1 {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const segmentCount = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < segmentCount; index += 1) {
    const leftSegment = leftParts[index] ?? 0;
    const rightSegment = rightParts[index] ?? 0;
    if (leftSegment < rightSegment) return -1;
    if (leftSegment > rightSegment) return 1;
  }
  return 0;
}

function minalyBackgroundTrustedUpdateUrl(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || !value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (url.username || url.password) return null;
    if (url.protocol === "https:" || (url.protocol === "http:" && url.origin === minalyDevelopmentOrigin)) return url.toString();
  } catch {
    return null;
  }
  return null;
}

function minalyReadBackgroundUpdate(value: unknown, origin: string): MinalyBackgroundUpdate | null {
  if (!minalyBackgroundIsRecord(value)) return null;
  const latestVersion = minalyBackgroundVersion(value.latestVersion);
  const distribution = value.distribution === "web_store" || value.distribution === "pilot_package" ? value.distribution : null;
  const downloaded = value.downloaded === true;
  if (!latestVersion || !distribution || (!downloaded && typeof value.updateUrl !== "string")) return null;
  return {
    latestVersion,
    updateUrl: minalyBackgroundTrustedUpdateUrl(value.updateUrl, origin),
    distribution,
    downloaded,
  };
}

function minalyBackgroundCurrentVersion(): string {
  return minalyBackgroundVersion(chrome.runtime.getManifest().version) ?? "0.0.0";
}

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
    if (!minalyBackgroundIsRecord(body)) continue;
    const data = minalyBackgroundIsRecord(body.data) ? body.data : body;
    const token = typeof data.extensionToken === "string" ? data.extensionToken : typeof data.token === "string" ? data.token : null;
    if (!token) continue;
    await chrome.storage.local.set({ [minalyBackgroundTokenKey]: token, [minalyBackgroundOriginKey]: origin });
    return token;
  }
  return null;
}

async function minalyBackgroundRequest(message: MinalyBackgroundRequest): Promise<{ status: number; body: unknown }> {
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
  if (response.status === 401) {
    await chrome.storage.local.remove([minalyBackgroundTokenKey]);
    token = await minalyBackgroundSession();
    origin = await minalyBackgroundOrigin();
    response = await request(origin, token);
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

async function minalyBackgroundFetchRelease(): Promise<MinalyBackgroundUpdate | null> {
  const preferredOrigin = await minalyBackgroundOrigin();
  const origins = preferredOrigin === minalyProductionOrigin
    ? [minalyProductionOrigin, minalyDevelopmentOrigin]
    : [minalyDevelopmentOrigin, minalyProductionOrigin];
  const currentVersion = minalyBackgroundCurrentVersion();
  for (const origin of origins) {
    let response: Response;
    try {
      const url = new URL("/api/crm/extension/release", origin);
      url.searchParams.set("currentVersion", currentVersion);
      response = await fetch(url.toString(), { method: "GET", credentials: "omit", headers: { Accept: "application/json" } });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const body: unknown = await response.json().catch(() => null);
    if (!minalyBackgroundIsRecord(body)) continue;
    const data = minalyBackgroundIsRecord(body.data) ? body.data : body;
    if (data.updateAvailable !== true) return null;
    const update = minalyReadBackgroundUpdate(data, origin);
    if (update && minalyBackgroundCompareVersions(update.latestVersion, currentVersion) > 0 && update.updateUrl) return update;
  }
  return null;
}

async function minalyBackgroundCheckUpdate(): Promise<MinalyBackgroundUpdate | null> {
  const origin = await minalyBackgroundOrigin();
  const currentVersion = minalyBackgroundCurrentVersion();
  const values = await chrome.storage.local.get([minalyBackgroundPendingUpdateKey, minalyBackgroundReleaseCacheKey]);
  const pending = minalyReadBackgroundUpdate(values[minalyBackgroundPendingUpdateKey], origin);
  if (pending && minalyBackgroundCompareVersions(pending.latestVersion, currentVersion) > 0) return pending;
  if (values[minalyBackgroundPendingUpdateKey] !== undefined) await chrome.storage.local.remove([minalyBackgroundPendingUpdateKey]);

  const cache = minalyIsRecord(values[minalyBackgroundReleaseCacheKey]) ? values[minalyBackgroundReleaseCacheKey] : null;
  if (cache && typeof cache.checkedAt === "number" && Date.now() - cache.checkedAt < minalyBackgroundReleaseCacheTtlMs) {
    return minalyReadBackgroundUpdate(cache.update, origin);
  }

  const update = await minalyBackgroundFetchRelease();
  await chrome.storage.local.set({ [minalyBackgroundReleaseCacheKey]: { checkedAt: Date.now(), update } });
  return update;
}

async function minalyBackgroundApplyUpdate(): Promise<{ ok: boolean; error?: string }> {
  const origin = await minalyBackgroundOrigin();
  const values = await chrome.storage.local.get([minalyBackgroundPendingUpdateKey, minalyBackgroundReleaseCacheKey]);
  const currentVersion = minalyBackgroundCurrentVersion();
  const pending = minalyReadBackgroundUpdate(values[minalyBackgroundPendingUpdateKey], origin);
  if (pending && pending.downloaded && minalyBackgroundCompareVersions(pending.latestVersion, currentVersion) > 0) {
    chrome.runtime.reload();
    return { ok: true };
  }

  const cached = minalyIsRecord(values[minalyBackgroundReleaseCacheKey]) ? values[minalyBackgroundReleaseCacheKey] : null;
  const cachedUpdate = cached ? minalyReadBackgroundUpdate(cached.update, origin) : null;
  const update = cachedUpdate ?? await minalyBackgroundCheckUpdate();
  if (!update?.updateUrl) return { ok: false, error: "update_unavailable" };
  await chrome.tabs.create({ url: update.updateUrl });
  return { ok: true };
}

async function minalyBroadcastUpdate(update: MinalyBackgroundUpdate): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.flatMap((tab) => typeof tab.id === "number"
    ? [chrome.tabs.sendMessage(tab.id, { type: "minaly-update-available", update }).catch(() => undefined)]
    : []));
}

async function minalyOpenAuth(senderTabId?: number): Promise<void> {
  const origin = await minalyBackgroundOrigin();
  const state = crypto.randomUUID();
  const callbackUrl = chrome.runtime.getURL("auth-callback.html");
  await chrome.storage.local.set({ [minalyBackgroundAuthStateKey]: state, [minalyBackgroundAuthTabKey]: senderTabId ?? null });
  const authUrl = new URL("/sign-in", origin);
  authUrl.searchParams.set("extension", "1");
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("state", state);
  await chrome.tabs.create({ url: authUrl.toString() });
}

async function minalyCompleteAuth(value: unknown, sender: { id?: string; tab?: { id?: number } }): Promise<{ ok: boolean; error?: string }> {
  const callback = minalyReadAuthCallback(value);
  if (!callback || sender.id !== chrome.runtime.id) return { ok: false, error: "invalid_callback" };
  const values = await chrome.storage.local.get([minalyBackgroundAuthStateKey, minalyBackgroundAuthTabKey]);
  if (values[minalyBackgroundAuthStateKey] !== callback.state) return { ok: false, error: "invalid_state" };
  const tabId = typeof values[minalyBackgroundAuthTabKey] === "number" ? values[minalyBackgroundAuthTabKey] : sender.tab?.id;
  await chrome.storage.local.remove([minalyBackgroundAuthStateKey, minalyBackgroundAuthTabKey]);
  if (!callback.token) {
    if (typeof tabId === "number") void chrome.tabs.sendMessage(tabId, { type: "minaly-auth-failed", error: callback.error ?? "auth_failed" }).catch(() => undefined);
    return { ok: false, error: callback.error ?? "auth_failed" };
  }

  const origin = await minalyBackgroundOrigin();
  await chrome.storage.local.set({ [minalyBackgroundTokenKey]: callback.token, [minalyBackgroundOriginKey]: origin });
  if (typeof tabId === "number") void chrome.tabs.sendMessage(tabId, { type: "minaly-authenticated" }).catch(() => undefined);
  return { ok: true };
}

chrome.runtime.onUpdateAvailable.addListener((details) => {
  const latestVersion = minalyBackgroundVersion(details.version);
  if (!latestVersion || minalyBackgroundCompareVersions(latestVersion, minalyBackgroundCurrentVersion()) <= 0) return;
  const update: MinalyBackgroundUpdate = { latestVersion, updateUrl: null, distribution: "web_store", downloaded: true };
  void chrome.storage.local.set({ [minalyBackgroundPendingUpdateKey]: update }).then(() => minalyBroadcastUpdate(update)).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!minalyBackgroundIsRecord(message) || typeof message.type !== "string") return;
  if (message.type === "minaly-open-auth") {
    void minalyOpenAuth(sender.tab?.id).catch(() => undefined);
    return;
  }
  if (message.type === "minaly-auth-callback") {
    void minalyCompleteAuth(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, error: "auth_failed" }));
    return true;
  }
  if (message.type === "minaly-check-update") {
    if (sender.id && sender.id !== chrome.runtime.id) return;
    void minalyBackgroundCheckUpdate().then((update) => sendResponse({ ok: true, update })).catch(() => sendResponse({ ok: false, update: null }));
    return true;
  }
  if (message.type === "minaly-apply-update") {
    if (sender.id && sender.id !== chrome.runtime.id) return;
    void minalyBackgroundApplyUpdate().then(sendResponse).catch(() => sendResponse({ ok: false, error: "update_unavailable" }));
    return true;
  }
  if (message.type === "minaly-api-request") {
    const request = minalyReadBackgroundRequest(message);
    if (!request) {
      sendResponse({ status: 400, body: { error: "invalid_path" } });
      return;
    }
    void minalyBackgroundRequest(request).then(sendResponse).catch(() => sendResponse({ status: 503, body: { error: "network_error" } }));
    return true;
  }
});
