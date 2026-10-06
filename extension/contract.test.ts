import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) as {
  manifest_version: number;
  version: string;
  permissions: string[];
  host_permissions: string[];
  background: { service_worker: string };
  content_scripts: Array<{ js: string[]; matches: string[] }>;
};
const contentSource = readFileSync(new URL("./src/content.ts", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("./src/background.ts", import.meta.url), "utf8");
const callbackSource = readFileSync(new URL("./src/auth-callback.ts", import.meta.url), "utf8");
const callbackPage = readFileSync(new URL("./auth-callback.html", import.meta.url), "utf8");
const crmQueriesSource = readFileSync(new URL("../lib/crm/queries.ts", import.meta.url), "utf8");
const extensionResolveRouteSource = readFileSync(new URL("../app/api/crm/extension/resolve/route.ts", import.meta.url), "utf8");
const extensionUpdateRouteSource = readFileSync(new URL("../app/api/crm/extension/update/route.ts", import.meta.url), "utf8");
const extensionMessageTestConfirmationRouteSource = readFileSync(new URL("../app/api/crm/extension/message-tests/confirm-send/route.ts", import.meta.url), "utf8");

describe("Minaly CRM Chrome extension contract", () => {
  it("uses a minimal Manifest V3 surface", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe("0.3.6");
    expect(manifest.permissions).toEqual(["storage", "tabs"]);
    expect(manifest.background.service_worker).toBe("dist/background.js");
    expect(manifest.host_permissions).toEqual(expect.arrayContaining(["https://www.minaly.io/*"]));
    expect(manifest.content_scripts[0]?.matches).toEqual(expect.arrayContaining([
      "https://www.instagram.com/*",
      "https://www.linkedin.com/*",
    ]));
  });

  it("keeps social capture DOM-only and blocks message automation", () => {
    expect(contentSource).not.toContain("graph.facebook.com");
    expect(contentSource).not.toContain("api.linkedin.com");
    expect(contentSource).not.toContain("send-message");
    expect(contentSource).toContain("document.querySelector");
    expect(contentSource).toContain("profileUrl: profile.canonicalProfileUrl");
    expect(contentSource).toContain("handle: profile.normalizedHandle");
    expect(backgroundSource).toContain("/api/crm/extension/session");
    expect(backgroundSource).toContain("https://www.minaly.io");
    expect(backgroundSource).toContain("minalyCrmExtensionToken");
    expect(backgroundSource).toContain("minalyCrmExtensionAuthState");
    expect(backgroundSource).toContain("/api/crm/extension/search");
    expect(backgroundSource).toContain("/api/crm/extension/message-tests/confirm-send");
    expect(backgroundSource).toContain("minaly-check-update");
    expect(backgroundSource).toContain("onUpdateAvailable");
    expect(backgroundSource).toContain("chrome.runtime.getURL(\"auth-callback.html\")");
    expect(callbackSource).toContain("minaly-auth-callback");
    expect(callbackPage).toContain("dist/auth-callback.js");
    expect(contentSource).toContain("defaultOfferId");
    expect(contentSource).toContain("canonicalProfileUrl: typeof value.canonicalProfileUrl");
    expect(contentSource).toContain("minaly-profile-link");
    expect(contentSource).toContain("minalyResolutionCacheTtlMs");
    expect(contentSource).toContain("minaly-authenticated");
    expect(contentSource).toContain("MISE À JOUR DISPONIBLE");
    expect(contentSource).toContain("minalyStageImpliesResponse(resolution.lead.stage)");
    expect(contentSource).toContain("minalyLeadLink(resolution.lead.id, crmUrl)");
    expect(contentSource).toContain("minalyLeadLink(candidate.id, crmUrl)");
    expect(extensionResolveRouteSource).toContain("crmUrl");
  });

  it("reconciles an extension response through the canonical CRM milestone", () => {
    expect(contentSource).toContain('responseOccurredAt: new Date().toISOString()');
    expect(extensionUpdateRouteSource).toContain("markCrmResponse");
    expect(extensionUpdateRouteSource).toContain('"extension"');
    expect(extensionMessageTestConfirmationRouteSource).toContain("confirmCrmMessageAbTestSend");
  });

  it("keeps message copying separate from the explicit send confirmation request", () => {
    const copyStart = contentSource.indexOf("const copyMessage = async");
    const confirmStart = contentSource.indexOf("const confirmMessageSent = async");
    const drawStart = contentSource.indexOf("const draw = () =>", confirmStart);
    const copyHandler = contentSource.slice(copyStart, confirmStart);
    const confirmHandler = contentSource.slice(confirmStart, drawStart);

    expect(copyHandler).toContain("navigator.clipboard.writeText(text)");
    expect(copyHandler).toContain("messageCopied = true");
    expect(copyHandler).not.toContain("minalyRequest(");
    expect(confirmHandler).toContain('"/api/crm/extension/message-tests/confirm-send"');
    expect(confirmHandler).toContain("{ assignmentId }");
  });

  it("does not offer an assigned test message after a lead was contacted outside the test", () => {
    expect(contentSource).toContain('lead.contactState === "contacted" || lead.messageOccurredAt');
    expect(contentSource).toContain("Cette variante ne peut pas être copiée ni comptabilisée.");
  });

  it("keeps the extension responsive while requests are in flight", () => {
    expect(contentSource).toContain("const minalyResolutionCacheTtlMs = 30_000");
    expect(contentSource).toContain("resolutionAccountId");
    expect(contentSource).toContain("event.stopPropagation()");
    expect(contentSource).toContain("event.preventDefault()");
    expect(contentSource).toContain("event.stopImmediatePropagation()");
    expect(contentSource).toContain('close.addEventListener("pointerdown"');
    expect(contentSource).toContain(".minaly-panel[hidden] { display: none; }");
    expect(contentSource).toContain("operationId += 1");
    expect(contentSource).toContain("chrome.runtime.onMessage.removeListener(handleRuntimeMessage)");
    expect(contentSource).toContain("reference.insertAdjacentElement(\"afterend\", host)");
    expect(crmQueriesSource).toContain("const [profileExactResult, legacyExactResult] = await Promise.all");
    expect(extensionResolveRouteSource).toContain("getBusinessSalesOffers");
  });
});
