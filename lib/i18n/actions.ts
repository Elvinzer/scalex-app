"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, type Locale } from "./config";

// Writes the choice to BOTH places, deliberately:
//   • users.locale is the source of truth, so the preference follows the
//     account to another browser or device;
//   • the cookie makes the very next render correct even before any session
//     read, and is the only carrier on signed-out screens.
// Writing the cookie first means the switch is never lost if the DB write
// fails — the user still gets the language they asked for.
export async function setLocaleAction(next: string): Promise<{ error: string | null }> {
  if (!isLocale(next)) return { error: "Unsupported locale." };
  const locale: Locale = next;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    // Readable by the client is fine — a language preference is not a secret,
    // and no auth decision is ever made from it.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (userId) {
    await db.update(users).set({ locale }).where(eq(users.id, userId));
  }

  // Every server-rendered string in the app comes from the request locale, so
  // the whole tree has to re-render — layout included (the sidebar lives
  // there).
  revalidatePath("/", "layout");
  return { error: null };
}
