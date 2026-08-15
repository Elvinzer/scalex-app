import { describe, expect, it } from "vitest";

import { buildSupportTicketContext, sanitizeSupportPathname } from "@/lib/support/context";

describe("support context", () => {
  it("removes sensitive query parameters from the captured pathname", () => {
    expect(sanitizeSupportPathname("/diagnostic-app?tab=overview&access_token=secret&code=abc")).toBe("/diagnostic-app?tab=overview");
  });

  it("keeps a safe path and derives coarse browser information", () => {
    const context = buildSupportTicketContext({
      pathname: "/dashboard",
      locale: "fr",
      viewport: { width: 1440, height: 900 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
      now: new Date("2026-08-14T12:00:00.000Z"),
    });
    expect(context.pathname).toBe("/dashboard");
    expect(context.browser).toBe("Chrome");
    expect(context.os).toBe("macOS");
    expect(context.viewport).toEqual({ width: 1440, height: 900 });
    expect(context.capturedAt).toBe("2026-08-14T12:00:00.000Z");
  });
});

