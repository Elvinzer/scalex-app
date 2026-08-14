import { cookies, headers } from "next/headers";

import {
  getLocalSuperuserConfig,
  hostnameFromHostHeader,
  LOCAL_SUPERUSER_COOKIE,
  LOCAL_SUPERUSER_COOKIE_VALUE,
  isLocalSuperuserDisabled,
  LOCAL_SUPERUSER_DISABLED_COOKIE,
} from "@/lib/auth/local-superuser";

export async function getLocalSuperuserClaims() {
  const requestHeaders = await headers();
  const config = getLocalSuperuserConfig(hostnameFromHostHeader(requestHeaders.get("host")));
  if (!config) return null;

  const requestCookies = await cookies();
  if (isLocalSuperuserDisabled(requestCookies.get(LOCAL_SUPERUSER_DISABLED_COOKIE)?.value)) return null;
  if (requestCookies.get(LOCAL_SUPERUSER_COOKIE)?.value !== LOCAL_SUPERUSER_COOKIE_VALUE) return null;

  return {
    aud: "authenticated",
    role: "authenticated",
    sub: config.id,
    email: config.email,
  };
}
