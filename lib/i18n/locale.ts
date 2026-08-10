import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  matchLocaleFromAcceptLanguage,
  type Locale,
} from "./config";

// Resolution order, and the reason for it:
//   1. users.locale — the source of truth (§A). A signed-in user's choice
//      follows them across devices and browsers.
//   2. the locale cookie — signed-out screens (sign-in, sign-up), and the
//      instant switch during onboarding before the write lands.
//   3. Accept-Language — first visit only, as a pre-selection.
//   4. French.
//
// Resolved once per request (React cache) and read server-side before the
// first byte, which is what prevents the flash of French the spec forbids:
// nothing renders in one language and then swaps in the browser.
export const getRequestLocale = cache(async (): Promise<Locale> => {
  const stored = await getStoredUserLocale();
  if (stored) return stored;

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  return matchLocaleFromAcceptLanguage(headerStore.get("accept-language"));
});

// null when signed out, or when the account predates this feature and has
// never chosen (see users.locale's schema comment) — the caller decides what
// that means rather than having a default silently baked in here.
export const getStoredUserLocale = cache(async (): Promise<Locale | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub as string | undefined;
    if (!userId) return null;

    const [row] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
    return isLocale(row?.locale) ? row.locale : null;
  } catch {
    // A locale lookup must never be able to break a page render — an
    // unreadable session or a DB hiccup degrades to the default language,
    // not to an error screen.
    return null;
  }
});

// True for accounts created before the language choice existed. Drives the
// dismissable "l'anglais est disponible" note in Réglages (§B) — and nothing
// else: these users are never sent back through onboarding.
export const hasNeverChosenLocale = cache(async (): Promise<boolean> => {
  return (await getStoredUserLocale()) === null;
});

export { DEFAULT_LOCALE };
