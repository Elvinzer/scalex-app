import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { nativeCalendarConnections } from "@/db/schema";
import { exchangeCalendarCode, getCalendarAccountEmail } from "@/lib/native-booking/calendar";
import { encrypt } from "@/lib/crypto";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

type Provider = "google" | "outlook";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params;
  if (rawProvider !== "google" && rawProvider !== "outlook") return NextResponse.redirect(new URL("/ventes/rdv?calendar_error=provider", request.url));
  const provider = rawProvider as Provider;
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    const response = NextResponse.redirect(new URL(`/ventes/rdv?calendar_error=denied&provider=${provider}`, request.url));
    response.cookies.delete("native_calendar_oauth_state");
    return response;
  }
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("native_calendar_oauth_state")?.value ?? "";
  const [storedProvider, storedNonce, storedUserId] = storedState.split(":");
  if (!code || !returnedState || storedProvider !== provider || returnedState !== storedNonce || !storedUserId) {
    return NextResponse.redirect(new URL(`/ventes/rdv?calendar_error=state&provider=${provider}`, request.url));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims || data.claims.sub !== storedUserId) return NextResponse.redirect(new URL("/sign-in", request.url));
  const userId = data.claims.sub as string;
  const access = await requirePermission(userId, "ventes:rdv");
  if (!access || isRateLimited(`native-calendar-callback:${access.accountId}:${userId}`, 10)) {
    return NextResponse.redirect(new URL("/ventes/rdv", request.url));
  }

  const redirectUri = new URL(`/api/native-calendar/${provider}/callback`, request.url).toString();
  const [existing] = await db
    .select()
    .from(nativeCalendarConnections)
    .where(and(eq(nativeCalendarConnections.closerUserId, userId), eq(nativeCalendarConnections.provider, provider)))
    .limit(1);

  try {
    const tokens = await exchangeCalendarCode(provider, code, redirectUri);
    const email = await getCalendarAccountEmail(tokens.accessToken, provider);
    const values = {
      userId: access.accountId,
      closerUserId: userId,
      provider,
      providerAccountEmail: email,
      accessTokenEncrypted: encrypt(tokens.accessToken),
      refreshTokenEncrypted: tokens.refreshToken ? encrypt(tokens.refreshToken) : existing?.refreshTokenEncrypted ?? null,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000),
      selectedCalendarIds: existing?.selectedCalendarIds?.length ? existing.selectedCalendarIds : ["primary"],
      status: "connected" as const,
      lastError: null,
      updatedAt: new Date(),
    };

    await db
      .insert(nativeCalendarConnections)
      .values(values)
      .onConflictDoUpdate({
        target: [nativeCalendarConnections.closerUserId, nativeCalendarConnections.provider],
        set: values,
      });

    const response = NextResponse.redirect(new URL("/ventes/rdv?calendar=connected", request.url));
    response.cookies.delete("native_calendar_oauth_state");
    return response;
  } catch (error) {
    console.error("Native calendar OAuth callback failed", error);
    if (existing) {
      await db
        .update(nativeCalendarConnections)
        .set({ status: "reconnect_required", lastError: "La reconnexion du calendrier a échoué.", updatedAt: new Date() })
        .where(eq(nativeCalendarConnections.id, existing.id));
    }
    const response = NextResponse.redirect(new URL(`/ventes/rdv?calendar_error=oauth&provider=${provider}`, request.url));
    response.cookies.delete("native_calendar_oauth_state");
    return response;
  }
}
