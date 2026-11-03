import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_HEADER, PATHNAME_HEADER, SEARCH_HEADER } from "./routing";

const mocks = vi.hoisted(() => ({ forward: vi.fn() }));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: mocks.forward }));
vi.mock("@/lib/auth/local-superuser", () => ({
  getLocalSuperuserConfig: () => null,
  hostnameFromHostHeader: () => "localhost",
  isLocalSuperuserDisabled: () => false,
  LOCAL_SUPERUSER_COOKIE: "local", LOCAL_SUPERUSER_COOKIE_VALUE: "enabled",
  LOCAL_SUPERUSER_DISABLED_COOKIE: "disabled", LOCAL_SUPERUSER_DISABLED_COOKIE_VALUE: "enabled",
}));
import { proxy } from "@/proxy";

const A = "a1111111-1111-4111-8111-111111111111";
const B = "b2222222-2222-4222-8222-222222222222";
const origin = "https://minaly.example";

beforeEach(() => {
  mocks.forward.mockReset().mockImplementation((request: NextRequest) => NextResponse.next({ request: { headers: request.headers } }));
});

describe("business routing trust boundary", () => {
  it("leaves public marketing query parameters outside business context handling", async () => {
    const response = await proxy(new NextRequest(`${origin}/?business=a-public-search-term`));
    expect(response.status).toBe(200);
    expect(mocks.forward.mock.calls[0][0].headers.get(BUSINESS_HEADER)).toBeNull();
  });
  it("overwrites browser-supplied context before forwarding an API request", async () => {
    const request = new NextRequest(`${origin}/api/crm/extension/session`, { method: "POST", headers: {
      [BUSINESS_HEADER]: B, [PATHNAME_HEADER]: "/settings/facturation", [SEARCH_HEADER]: "?forged=1",
    } });
    await proxy(request);
    expect(mocks.forward).toHaveBeenCalledOnce();
    const forwarded: NextRequest = mocks.forward.mock.calls[0][0];
    expect(forwarded.headers.get(BUSINESS_HEADER)).toBeNull();
    expect(forwarded.headers.get(PATHNAME_HEADER)).toBe("/api/crm/extension/session");
    expect(forwarded.headers.get(SEARCH_HEADER)).toBe("");
  });

  it("ignores a business prefix supplied by a different origin", async () => {
    const request = new NextRequest(`${origin}/api/crm/extension/session`, { method: "POST", headers: { referer: `https://other.example/b/${A}/crm` } });
    await proxy(request);
    expect(mocks.forward.mock.calls[0][0].headers.get(BUSINESS_HEADER)).toBeNull();
  });

  it("pins API requests to their same-origin initiating tab", async () => {
    await proxy(new NextRequest(`${origin}/api/crm/extension/session`, { method: "POST", headers: { referer: `${origin}/b/${A}/crm` } }));
    await proxy(new NextRequest(`${origin}/api/crm/extension/session`, { method: "POST", headers: { referer: `${origin}/b/${B}/crm` } }));
    expect(mocks.forward.mock.calls.map(([request]) => request.headers.get(BUSINESS_HEADER))).toEqual([A, B]);
  });

  it("rejects conflicting explicit path and management-query businesses", async () => {
    const response = await proxy(new NextRequest(`${origin}/b/${A}/api/billing/portal?business=${B}`));
    expect(response.status).toBe(400);
    expect(mocks.forward).not.toHaveBeenCalled();
  });

  it("rejects malformed explicit business paths rather than selecting a default", async () => {
    const response = await proxy(new NextRequest(`${origin}/b/invalid/dashboard`));
    expect(response.status).toBe(400);
    expect(mocks.forward).not.toHaveBeenCalled();
  });

  it("preserves filters when redirecting a legacy link in a scoped tab", async () => {
    const response = await proxy(new NextRequest(`${origin}/ventes/suivi?period=last30`, { headers: { referer: `${origin}/b/${B}/business` } }));
    expect(response.headers.get("location")).toBe(`${origin}/b/${B}/ventes/suivi?period=last30`);
  });

  it("rewrites an explicit business path while retaining authoritative context", async () => {
    const response = await proxy(new NextRequest(`${origin}/b/${A}/business?section=identity`, { headers: { [BUSINESS_HEADER]: B } }));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${origin}/business?section=identity`);
    expect(response.headers.get(`x-middleware-request-${BUSINESS_HEADER}`)).toBe(A);
    expect(response.headers.get(`x-middleware-request-${PATHNAME_HEADER}`)).toBe("/business");
    expect(response.headers.get(`x-middleware-request-${SEARCH_HEADER}`)).toBe("?section=identity");
  });
});
