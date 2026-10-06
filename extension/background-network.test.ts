import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

type BackgroundMessageListener = (
  message: unknown,
  sender: { id?: string; tab?: { id?: number } },
  sendResponse: (response: unknown) => void,
) => boolean | void;

const backgroundSource = readFileSync(new URL("./dist/background.js", import.meta.url), "utf8");

function createBackgroundFixture(fetcher: (input: string) => Promise<Response>) {
  const storage = new Map<string, unknown>([
    ["minalyCrmExtensionOrigin", "http://localhost:3000"],
    ["minalyCrmExtensionToken", "expired-local-token"],
  ]);
  const listeners: BackgroundMessageListener[] = [];
  const chrome = {
    runtime: {
      id: "minaly-test-extension",
      getManifest: () => ({ version: "0.3.7" }),
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
  runInContext(backgroundSource, createContext({ chrome, fetch: fetcher, URL, Response }));
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
        return new Response(JSON.stringify({ data: { extensionToken: "fresh-production-token" } }), { status: 200 });
      }
      if (input === "https://www.minaly.io/api/crm/extension/resolve") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${input}`);
    });

    const result = await sendApiRequest(fixture.listeners) as { status: number; body: unknown };

    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(requestedUrls).toEqual([
      "http://localhost:3000/api/crm/extension/resolve",
      "https://www.minaly.io/api/crm/extension/session",
      "https://www.minaly.io/api/crm/extension/resolve",
    ]);
    expect(fixture.storage.get("minalyCrmExtensionOrigin")).toBe("https://www.minaly.io");
    expect(fixture.storage.get("minalyCrmExtensionToken")).toBe("fresh-production-token");
  });
});
