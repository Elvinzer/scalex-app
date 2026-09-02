import { z } from "zod";

const chromeExtensionIdPattern = /^[a-p]{32}$/;

export function isCrmExtensionRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "chrome-extension:" &&
      chromeExtensionIdPattern.test(url.hostname) &&
      url.pathname === "/auth-callback.html" &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === "" &&
      url.port === ""
    );
  } catch {
    return false;
  }
}

const crmExtensionRedirectUriSchema = z.string().trim().min(1).max(512).refine(isCrmExtensionRedirectUri, "Invalid extension redirect URI");

export const crmExtensionAuthQuerySchema = z.object({
  redirect_uri: crmExtensionRedirectUriSchema,
  state: z.string().trim().regex(/^[A-Za-z0-9_-]{16,128}$/, "Invalid extension auth state"),
});

export type CrmExtensionAuthQuery = z.infer<typeof crmExtensionAuthQuerySchema>;

export function readCrmExtensionAuthQuery(searchParams: URLSearchParams): CrmExtensionAuthQuery | null {
  const parsed = crmExtensionAuthQuerySchema.safeParse({
    redirect_uri: searchParams.get("redirect_uri"),
    state: searchParams.get("state"),
  });
  return parsed.success ? parsed.data : null;
}

export function crmExtensionCompletionPath(query: CrmExtensionAuthQuery): string {
  const url = new URL("/extension/auth/complete", "https://minaly.invalid");
  url.searchParams.set("redirect_uri", query.redirect_uri);
  url.searchParams.set("state", query.state);
  return `${url.pathname}${url.search}`;
}
