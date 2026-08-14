import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppUrl } from "@/lib/utils";

const APP_URL_ENV_NAMES = ["APP_URL", "NEXT_PUBLIC_APP_URL", "VERCEL_ENV", "VERCEL_URL"] as const;

function clearAppUrlEnvironment() {
  for (const name of APP_URL_ENV_NAMES) {
    vi.stubEnv(name, "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppUrl", () => {
  it("uses the explicit app URL first", () => {
    clearAppUrlEnvironment();
    vi.stubEnv("APP_URL", "https://custom.example/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public.example/");

    expect(getAppUrl()).toBe("https://custom.example");
  });

  it("uses the Minaly domain for production Vercel deployments", () => {
    clearAppUrlEnvironment();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "minaly-preview.vercel.app");

    expect(getAppUrl()).toBe("https://www.minaly.io");
  });

  it("uses the Minaly domain for production servers without Vercel metadata", () => {
    clearAppUrlEnvironment();
    vi.stubEnv("NODE_ENV", "production");

    expect(getAppUrl()).toBe("https://www.minaly.io");
  });

  it("keeps the deployment URL for Vercel previews", () => {
    clearAppUrlEnvironment();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "minaly-preview.vercel.app");

    expect(getAppUrl()).toBe("https://minaly-preview.vercel.app");
  });

  it("uses localhost when developing without a deployment URL", () => {
    clearAppUrlEnvironment();
    vi.stubEnv("NODE_ENV", "development");

    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});
