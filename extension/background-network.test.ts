import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

type BackgroundMessageListener = (
  message: unknown,
  sender: { id?: string; tab?: { id?: number } },
  sendResponse: (response: unknown) => void,
) => boolean | void;

const backgroundSource = readFileSync(new URL("./dist/background.js", import.meta.url), "utf8");
const businessA = "22222222-2222-4222-8222-222222222222";
const businessB = "33333333-3333-4333-8333-333333333333";
function advisoryToken(businessId: string) { return `${Buffer.from(JSON.stringify({ accountId: businessId })).toString("base64url")}.test-signature`; }

function createBackgroundFixture(fetcher: (input: string, init?: RequestInit) => Promise<Response>) {
  const storage = new Map<string, unknown>([
    ["minalyCrmExtensionOrigin", "http://localhost:3000"],
    ["minalyCrmExtensionToken", advisoryToken(businessA)],
    ["minalyCrmExtensionBusinessId", businessA],
    ["minalyCrmExtensionBusinessName", "Business A"],
  ]);
  const listeners: BackgroundMessageListener[] = [];
  const chrome = {
    runtime: {
      id: "minaly-test-extension",
      getManifest: () => ({ version: "0.3.9" }),
      onUpdateAvailable: { addListener: () => undefined },
      onMessage: { addListener: (listener: BackgroundMessageListener) => listeners.push(listener) },
    },
    storage: {
      local: {
        get: async (keys: string[]) => Object.fromEntries(keys.flatMap((key) => storage.has(key) ? [[key, storage.get(key)]] : [])),
        remove: async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); },
        set: async (values: Record<string, unknown>) => { Object.entries(values).forEach(([key, value]) => storage.set(key, value)); },
      },
    },
  };
  runInContext(backgroundSource, createContext({ chrome, fetch: fetcher, URL, Response, atob }));
  return { listeners, storage };
}

function sendApiRequest(listeners: BackgroundMessageListener[]): Promise<unknown> {
  const listener = listeners[0];
  if (!listener) throw new Error("The background service worker did not register a message listener.");
  return new Promise((resolve) => {
    const keepsChannelOpen = listener(
      { type: "minaly-api-request", path: "/api/crm/extension/resolve", payload: { handle: "fkarwaz" } },
      { id: "minaly-test-extension" },
      resolve,
    );
    if (keepsChannelOpen !== true) throw new Error("The API request listener did not keep the response channel open.");
  });
}

describe("CRM extension network recovery", () => {
  it("drops a stale local origin and retries through the production session", async () => {
    const requestedUrls: string[] = [];
    const fixture = createBackgroundFixture(async (input) => {
      requestedUrls.push(input);
      if (input === "http://localhost:3000/api/crm/extension/resolve") throw new Error("Local development server is unavailable.");
      if (input === "https://www.minaly.io/api/crm/extension/session") {
        return new Response(JSON.stringify({ data: { extensionToken: "fresh-production-token", businessId: businessA, businessName: "Business A" } }), { status: 200 });
      }
      if (input === "https://www.minaly.io/api/crm/extension/resolve") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${input}`);
    });

    const result = await sendApiRequest(fixture.listeners) as { status: number; body: unknown };

    expect(result).toEqual({ status: 200, body: { ok: true }, businessId: businessA, businessName: "Business A" });
    expect(requestedUrls).toEqual([
      "http://localhost:3000/api/crm/extension/resolve",
      "https://www.minaly.io/api/crm/extension/session",
      "https://www.minaly.io/api/crm/extension/resolve",
    ]);
    expect(fixture.storage.get("minalyCrmExtensionOrigin")).toBe("https://www.minaly.io");
    expect(fixture.storage.get("minalyCrmExtensionToken")).toBe("fresh-production-token");
  });

  it("renews the token business even when a different business is selected in the web app", async () => {
    const renewals: unknown[] = [];
    let attempts = 0;
    const fixture = createBackgroundFixture(async (input, init) => {
      if (input.endsWith("/session")) {
        renewals.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ data: { extensionToken: advisoryToken(businessA), businessId: businessA, businessName: "Business A" } }));
      }
      return new Response(JSON.stringify({ ok: true }), { status: attempts++ === 0 ? 401 : 200 });
    });
    fixture.storage.delete("minalyCrmExtensionBusinessId");
    const response = await sendApiRequest(fixture.listeners);
    expect(renewals).toEqual([{ businessId: businessA }]);
    expect(response).toMatchObject({ status: 200, businessId: businessA });
  });

  it("refuses a renewal response for a different business", async () => {
    const fixture = createBackgroundFixture(async (input, init) => {
      if (input.endsWith("/session")) {
        expect(JSON.parse(String(init?.body))).toEqual({ businessId: businessA });
        return new Response(JSON.stringify({ data: { extensionToken: advisoryToken(businessB), businessId: businessB, businessName: "Business B" } }));
      }
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    });
    await sendApiRequest(fixture.listeners);
    expect(fixture.storage.get("minalyCrmExtensionBusinessId")).toBe(businessA);
    expect(fixture.storage.get("minalyCrmExtensionToken")).not.toBe(advisoryToken(businessB));
  });

  it("does not select a business from browser cookies on first installation", async () => {
    const fetcher = vi.fn<(input: string) => Promise<Response>>(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
    const fixture = createBackgroundFixture(fetcher);
    fixture.storage.delete("minalyCrmExtensionBusinessId");
    fixture.storage.delete("minalyCrmExtensionBusinessName");
    fixture.storage.delete("minalyCrmExtensionToken");
    await sendApiRequest(fixture.listeners);
    expect(fetcher.mock.calls.every(([url]) => !String(url).endsWith("/session"))).toBe(true);
    expect(fixture.storage.get("minalyCrmExtensionBusinessId")).toBeUndefined();
  });
});
