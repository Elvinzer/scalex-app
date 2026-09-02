"use strict";
const minalyProductionOrigin = "https://www.minaly.io";
const minalyDevelopmentOrigin = "http://localhost:3000";
const minalyBackgroundOriginKey = "minalyCrmExtensionOrigin";
const minalyBackgroundTokenKey = "minalyCrmExtensionToken";
const minalyBackgroundAuthStateKey = "minalyCrmExtensionAuthState";
const minalyBackgroundAuthTabKey = "minalyCrmExtensionAuthTab";
const minalyBackgroundPaths = new Set([
    "/api/crm/extension/session",
    "/api/crm/extension/resolve",
    "/api/crm/extension/capture",
    "/api/crm/extension/update",
]);
function minalyBackgroundIsRecord(value) {
    return typeof value === "object" && value !== null;
}
function minalyReadBackgroundRequest(value) {
    if (!minalyBackgroundIsRecord(value) || value.type !== "minaly-api-request" || typeof value.path !== "string" || !minalyBackgroundPaths.has(value.path))
        return null;
    return { type: "minaly-api-request", path: value.path, payload: value.payload };
}
function minalyReadAuthCallback(value) {
    if (!minalyBackgroundIsRecord(value) || typeof value.state !== "string" || value.state.length < 16 || value.state.length > 128)
        return null;
    const token = typeof value.token === "string" && value.token.length > 0 && value.token.length <= 2048 ? value.token : null;
    const error = typeof value.error === "string" && value.error.length > 0 && value.error.length <= 80 ? value.error : null;
    if ((token === null && error === null) || (token !== null && error !== null))
        return null;
    return { state: value.state, token, error };
}
async function minalyBackgroundOrigin() {
    const values = await chrome.storage.local.get([minalyBackgroundOriginKey]);
    return values[minalyBackgroundOriginKey] === minalyDevelopmentOrigin ? minalyDevelopmentOrigin : minalyProductionOrigin;
}
async function minalyBackgroundSession() {
    const preferredOrigin = await minalyBackgroundOrigin();
    const origins = preferredOrigin === minalyProductionOrigin ? [minalyProductionOrigin, minalyDevelopmentOrigin] : [minalyDevelopmentOrigin, minalyProductionOrigin];
    for (const origin of origins) {
        let response;
        try {
            response = await fetch(`${origin}/api/crm/extension/session`, { method: "POST", credentials: "include" });
        }
        catch {
            continue;
        }
        if (!response.ok)
            continue;
        const body = await response.json().catch(() => null);
        if (!minalyBackgroundIsRecord(body))
            continue;
        const data = minalyBackgroundIsRecord(body.data) ? body.data : body;
        const token = typeof data.extensionToken === "string" ? data.extensionToken : typeof data.token === "string" ? data.token : null;
        if (!token)
            continue;
        await chrome.storage.local.set({ [minalyBackgroundTokenKey]: token, [minalyBackgroundOriginKey]: origin });
        return token;
    }
    return null;
}
async function minalyBackgroundRequest(message) {
    let origin = await minalyBackgroundOrigin();
    const values = await chrome.storage.local.get([minalyBackgroundTokenKey]);
    let token = typeof values[minalyBackgroundTokenKey] === "string" ? values[minalyBackgroundTokenKey] : await minalyBackgroundSession();
    const request = async (requestOrigin, bearer) => fetch(`${requestOrigin}${message.path}`, {
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
    let body = null;
    try {
        body = await response.json();
    }
    catch {
        body = null;
    }
    return { status: response.status, body };
}
async function minalyOpenAuth(senderTabId) {
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
async function minalyCompleteAuth(value, sender) {
    const callback = minalyReadAuthCallback(value);
    if (!callback || sender.id !== chrome.runtime.id)
        return { ok: false, error: "invalid_callback" };
    const values = await chrome.storage.local.get([minalyBackgroundAuthStateKey, minalyBackgroundAuthTabKey]);
    if (values[minalyBackgroundAuthStateKey] !== callback.state)
        return { ok: false, error: "invalid_state" };
    const tabId = typeof values[minalyBackgroundAuthTabKey] === "number" ? values[minalyBackgroundAuthTabKey] : sender.tab?.id;
    await chrome.storage.local.remove([minalyBackgroundAuthStateKey, minalyBackgroundAuthTabKey]);
    if (!callback.token) {
        if (typeof tabId === "number")
            void chrome.tabs.sendMessage(tabId, { type: "minaly-auth-failed", error: callback.error ?? "auth_failed" }).catch(() => undefined);
        return { ok: false, error: callback.error ?? "auth_failed" };
    }
    const origin = await minalyBackgroundOrigin();
    await chrome.storage.local.set({ [minalyBackgroundTokenKey]: callback.token, [minalyBackgroundOriginKey]: origin });
    if (typeof tabId === "number")
        void chrome.tabs.sendMessage(tabId, { type: "minaly-authenticated" }).catch(() => undefined);
    return { ok: true };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!minalyBackgroundIsRecord(message) || typeof message.type !== "string")
        return;
    if (message.type === "minaly-open-auth") {
        void minalyOpenAuth(sender.tab?.id).catch(() => undefined);
        return;
    }
    if (message.type === "minaly-auth-callback") {
        void minalyCompleteAuth(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, error: "auth_failed" }));
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
