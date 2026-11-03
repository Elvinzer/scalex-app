import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/locales/en/businesses.json";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), businesses: vi.fn(), access: vi.fn(), ensure: vi.fn() }));
vi.mock("@/lib/auth/request", () => ({ getAuthIdentity: mocks.identity }));
vi.mock("@/lib/businesses/queries", () => ({ listUserBusinesses: mocks.businesses }));
vi.mock("@/lib/current-user", () => ({ ensureUserRow: mocks.ensure }));
vi.mock("@/lib/crm/access", () => ({ requireCrmAccess: mocks.access }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => createTranslator({ locale: "en", messages: { businesses: messages }, namespace: "businesses" }) }));

import Page from "./page";

const actor = "11111111-1111-4111-8111-111111111111";
const businessA = "22222222-2222-4222-8222-222222222222";
const businessB = "33333333-3333-4333-8333-333333333333";
const callback = `chrome-extension://${"a".repeat(32)}/auth-callback.html`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ userId: actor, email: "actor@example.test" });
  mocks.businesses.mockResolvedValue([{ id: businessA, name: "Business A", active: true, isOwner: true }, { id: businessB, name: "Business B", active: true, isOwner: false }]);
  mocks.access.mockResolvedValue({});
});

describe("extension business selection", () => {
  it("shows both businesses and submits an explicit business in each choice", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ redirect_uri: callback, state: "handoff_state_12345" }) }));
    expect(html).toContain("Choose a business for Minaly CRM");
    expect(html).toContain("Connect Business A");
    expect(html).toContain("Connect Business B");
    expect(html).toContain(`name="businessId" value="${businessA}"`);
    expect(html).toContain(`name="businessId" value="${businessB}"`);
    expect(mocks.access.mock.calls).toEqual([[actor, "crm:view", businessA], [actor, "crm:view", businessB]]);
    expect(html).not.toContain("businesses.extensionAuth");
  });

  it("disables a business without CRM access and never chooses a different business automatically", async () => {
    mocks.access.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ redirect_uri: callback, state: "handoff_state_12345" }) }));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("CRM access is unavailable for this business.");
  });

  it("rejects an invalid callback before reading business membership", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ redirect_uri: "https://evil.test", state: "handoff_state_12345" }) }));
    expect(html).toContain("This extension connection link is invalid.");
    expect(mocks.businesses).not.toHaveBeenCalled();
  });
});
