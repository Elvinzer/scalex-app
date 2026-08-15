import { afterEach, describe, expect, it, vi } from "vitest";

import { neutralizeDiscordMentions, sendSupportDiscordTicket } from "@/lib/support/discord";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("support Discord payload safety", () => {
  it("neutralizes every mention marker", () => {
    expect(neutralizeDiscordMentions("@everyone @here @cedric")).toBe("@\u200beveryone @\u200bhere @\u200bcedric");
  });

  it("sends a safe payload without allowing mentions", async () => {
    vi.stubEnv("SUPPORT_DISCORD_WEBHOOK_URL", ["https://discord.com", "api", "webhooks", "test", "token"].join("/"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendSupportDiscordTicket({
      id: "00000000-0000-4000-8000-000000000000",
      reference: "MNL-TEST123",
      type: "bug",
      title: "@everyone should never notify",
      description: "The page is not responding.",
      status: "new",
      priority: "medium",
      requesterName: "Cédric",
      requesterEmail: "cedric@example.com",
      accountName: "Acme",
      context: {
        pageKey: "dashboard",
        pageLabel: "Dashboard",
        pathname: "/dashboard",
        locale: "fr",
        browser: "Chrome",
        os: "macOS",
        userAgent: null,
        viewport: { width: 1_440, height: 900 },
        capturedAt: new Date().toISOString(),
        deploymentVersion: null,
      },
      hasCapture: false,
    });
    expect(result).toEqual({ status: "sent", messageId: "message-id" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { allowed_mentions: { parse: string[] }; embeds: Array<{ fields: Array<{ value: string }> }> };
    expect(payload.allowed_mentions.parse).toEqual([]);
    expect(payload.embeds[0].fields.some((field) => field.value.includes("@\u200beveryone"))).toBe(true);
  });

  it("returns a non-sensitive failure code when Discord rejects the request", async () => {
    vi.stubEnv("SUPPORT_DISCORD_WEBHOOK_URL", ["https://discord.com", "api", "webhooks", "test", "token"].join("/"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    const result = await sendSupportDiscordTicket({
      id: "00000000-0000-4000-8000-000000000000",
      reference: "MNL-TEST123",
      type: "question",
      title: "Question",
      description: "Please explain this behavior.",
      status: "new",
      priority: "low",
      requesterName: null,
      requesterEmail: "cedric@example.com",
      accountName: null,
      context: {
        pageKey: null,
        pageLabel: null,
        pathname: "/support",
        locale: "fr",
        browser: "Chrome",
        os: "macOS",
        userAgent: null,
        viewport: null,
        capturedAt: new Date().toISOString(),
        deploymentVersion: null,
      },
      hasCapture: false,
    });
    expect(result).toEqual({ status: "failed", errorCode: "timeout" });
  });
});
