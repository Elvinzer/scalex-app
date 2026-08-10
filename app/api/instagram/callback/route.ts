import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { instagramConnections, users } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchProfile, InstagramNotProfessionalAccountError } from "@/lib/instagram/client";
import { inngest, instagramAccountConnected } from "@/lib/inngest/client";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";
import { requireEnv } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("instagram_oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const userId = data.claims.sub as string;
  // Same owner-only boundary as /api/instagram/connect (the route that
  // starts this flow) — defense in depth in case this callback is ever hit
  // directly.
  const access = await requireOwner(userId);
  if (!access) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }
  if (isRateLimited(`instagram-callback:${access.accountId}`, 10)) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const clientId = requireEnv("INSTAGRAM_APP_ID");
  const clientSecret = requireEnv("INSTAGRAM_APP_SECRET");
  const redirectUri = new URL("/api/instagram/callback", origin).toString();

  const errorRedirect = (reason: string) => {
    const url = new URL("/acquisition/contenu", origin);
    url.searchParams.set("instagram_error", reason);
    const res = NextResponse.redirect(url);
    res.cookies.delete("instagram_oauth_state");
    return res;
  };

  try {
    const shortLived = await exchangeCodeForToken({ code, redirectUri, clientId, clientSecret });
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken, clientSecret);
    const profile = await fetchProfile(longLived.accessToken);

    const tokenExpiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000);
    const values = {
      userId: access.accountId,
      igUserId: profile.igUserId,
      username: profile.username,
      followersCount: profile.followersCount,
      followersCountUpdatedAt: profile.followersCount === null ? null : new Date(),
      accessTokenEncrypted: encrypt(longLived.accessToken),
      tokenExpiresAt,
      // Reset on every (re)connect — the Inngest job flips this to
      // "completed"/"failed" once the backfill finishes.
      initialSyncStatus: "pending" as const,
    };

    await Promise.all([
      db
        .insert(instagramConnections)
        .values(values)
        .onConflictDoUpdate({
          target: instagramConnections.userId,
          set: { ...values, connectedAt: new Date(), initialSyncCompletedAt: null },
        }),
      db.update(users).set({ instagramConnected: true }).where(eq(users.id, access.accountId)),
    ]);

    // Best-effort — the connection itself is already durably saved above by
    // this point. An Inngest hiccup must never turn a successful Instagram
    // connection into a crashed OAuth callback.
    try {
      await inngest.send(instagramAccountConnected.create({ userId: access.accountId }));
    } catch (error) {
      console.error("inngest.send(instagramAccountConnected) failed, Instagram connection saved anyway", error);
    }

    const response = NextResponse.redirect(new URL("/acquisition/contenu", origin));
    response.cookies.delete("instagram_oauth_state");
    return response;
  } catch (error) {
    if (error instanceof InstagramNotProfessionalAccountError) {
      return errorRedirect("not_professional");
    }
    console.error("Instagram OAuth callback failed", error);
    return errorRedirect("unknown");
  }
}
