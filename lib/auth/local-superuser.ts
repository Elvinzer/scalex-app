import { z } from "zod";

export const LOCAL_SUPERUSER_COOKIE = "scalex_local_superuser";
export const LOCAL_SUPERUSER_COOKIE_VALUE = "enabled";

const localSuperuserConfigSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
});

export type LocalSuperuserConfig = z.infer<typeof localSuperuserConfigSchema>;

function isLocalhost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalizedHostname === "localhost" || normalizedHostname === "127.0.0.1" || normalizedHostname === "::1";
}

export function hostnameFromHostHeader(host: string | null): string | null {
  if (!host) return null;
  const firstHost = host.split(",", 1)[0]?.trim();
  if (!firstHost) return null;
  if (firstHost.startsWith("[")) {
    const closingBracket = firstHost.indexOf("]");
    return closingBracket > 0 ? firstHost.slice(1, closingBracket) : null;
  }
  return firstHost.split(":", 1)[0] ?? null;
}

export function getLocalSuperuserConfig(hostname: string | null): LocalSuperuserConfig | null {
  if (process.env.NODE_ENV !== "development" || !hostname || !isLocalhost(hostname)) return null;

  const parsed = localSuperuserConfigSchema.safeParse({
    id: process.env.LOCAL_SUPERUSER_ID,
    email: process.env.LOCAL_SUPERUSER_EMAIL,
  });

  return parsed.success ? parsed.data : null;
}
