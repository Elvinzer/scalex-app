import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { users, youtubeConnections } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForTokens, fetchChannel, YoutubeChannelNotFoundError } from "@/lib/youtube/client";
import { inngest, youtubeAccountConnected } from "@/lib/inngest/client";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";
import { requireEnv } from "@/lib/utils";
import { YOUTUBE_OAUTH_SCOPES } from "@/lib/youtube/protocol";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("youtube_oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const userId = data.claims.sub as string;
  // Same owner-only boundary as /api/youtube/connect (the route that starts
  // this flow) — defense in depth in case this callback is ever hit directly.
  const access = await requireOwner(userId);
  if (!access) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }
  if (isRateLimited(`youtube-callback:${access.accountId}`, 10)) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const clientId = requireEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = requireEnv("YOUTUBE_CLIENT_SECRET");
  const redirectUri = new URL("/api/youtube/callback", origin).toString();

  const errorRedirect = (reason: string) => {
    const url = new URL("/acquisition/contenu", origin);
    url.searchParams.set("youtube_error", reason);
    const res = NextResponse.redirect(url);
    res.cookies.delete("youtube_oauth_state");
    return res;
  };

  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri, clientId, clientSecret });
    if (!tokens.refreshToken) {
      // Should not happen with access_type=offline&prompt=consent (see
      // protocol.ts) — surfaced explicitly rather than silently connecting
      // with no way to stay authenticated past the first ~1h.
      return errorRedirect("no_refresh_token");
    }

    const channel = await fetchChannel(tokens.accessToken);
    const tokenExpiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000);

    const values = {
      userId: access.accountId,
      channelId: channel.channelId,
      channelTitle: channel.title,
      channelThumbnailUrl: channel.thumbnailUrl,
      subscriberCount: channel.subscriberCount,
      viewCountTotal: channel.viewCountTotal,
      accessTokenEncrypted: encrypt(tokens.accessToken),
      refreshTokenEncrypted: encrypt(tokens.refreshToken),
      tokenExpiresAt,
      scope: YOUTUBE_OAUTH_SCOPES.join(" "),
      // Reset on every (re)connect — the Inngest job flips this to
      // "completed"/"failed" once the backfill finishes.
      initialSyncStatus: "pending" as const,
    };

    await Promise.all([
      db
        .insert(youtubeConnections)
        .values(values)
        .onConflictDoUpdate({
          target: youtubeConnections.userId,
          set: { ...values, connectedAt: new Date(), initialSyncCompletedAt: null },
        }),
      db.update(users).set({ youtubeConnected: true }).where(eq(users.id, access.accountId)),
    ]);

    // Best-effort — the connection itself is already durably saved above by
    // this point. An Inngest hiccup must never turn a successful YouTube
    // connection into a crashed OAuth callback.
    try {
      await inngest.send(youtubeAccountConnected.create({ userId: access.accountId }));
    } catch (error) {
      console.error("inngest.send(youtubeAccountConnected) failed, YouTube connection saved anyway", error);
    }

    const response = NextResponse.redirect(new URL("/acquisition/contenu", origin));
    response.cookies.delete("youtube_oauth_state");
    return response;
  } catch (error) {
    if (error instanceof YoutubeChannelNotFoundError) {
      return errorRedirect("no_channel");
    }
    console.error("YouTube OAuth callback failed", error);
    return errorRedirect("unknown");
  }
}
