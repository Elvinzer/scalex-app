import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { metaAdsConnections, users } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { getMetaAppCredentials } from "@/lib/meta-ads/config";
import {
  debugMetaToken,
  exchangeForLongLivedMetaToken,
  exchangeMetaCode,
  getMetaUser,
  MetaApiError,
} from "@/lib/meta-ads/client";
import { classifyMetaOAuthError } from "@/lib/meta-ads/oauth-errors";
import { verifyMetaOAuthState } from "@/lib/meta-ads/oauth-state";
import { inngest, metaAdsAccountConnected } from "@/lib/inngest/client";
import { isRateLimited } from "@/lib/rate-limit";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";

const STATE_COOKIE = "meta_ads_oauth_state";
const MODE_COOKIE = "meta_ads_oauth_mode";
const RETURN_COOKIE = "meta_ads_return_to";

function safeReturnPath(value: string | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value === "/acquisition/ads" || value.startsWith("/acquisition/ads/meta/") || value === "/integrations") return value;
  return null;
}

function redirectWithError(origin: string, reason: string, returnTo: string | null = null) {
  const url = new URL(returnTo ?? "/integrations", origin);
  url.searchParams.set("meta_ads_error", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(MODE_COOKIE);
  response.cookies.delete(RETURN_COOKIE);
  return response;
}

function redirectWriteDeclined(origin: string, returnTo: string | null): NextResponse {
  const destination = new URL(returnTo ?? "/integrations", origin);
  destination.searchParams.set("meta_ads", "write_declined");
  const response = NextResponse.redirect(destination);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(MODE_COOKIE);
  response.cookies.delete(RETURN_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const oauthErrorReason = request.nextUrl.searchParams.get("error_reason");
  const oauthErrorDescription = request.nextUrl.searchParams.get("error_description");
  const storedState = request.cookies.get(STATE_COOKIE)?.value;
  const isWriteStepUp = request.cookies.get(MODE_COOKIE)?.value === "write";
  const returnTo = safeReturnPath(request.cookies.get(RETURN_COOKIE)?.value);
  if (!state || !storedState || state !== storedState) return redirectWithError(origin, "state", returnTo);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.redirect(new URL("/sign-in", origin));
  const claimUserId = z.string().uuid().safeParse(data.claims.sub);
  if (!claimUserId.success) return redirectWithError(origin, "access", returnTo);
  const access = await requireOwner(claimUserId.data);
  if (!access || isRateLimited(`meta-ads-callback:${access.accountId}`, 10)) {
    return redirectWithError(origin, "access", returnTo);
  }

  const credentials = getMetaAppCredentials();
  if (!credentials) return redirectWithError(origin, "config", returnTo);
  const { appId, appSecret } = credentials;
  if (!verifyMetaOAuthState(state, access.accountId, appSecret)) return redirectWithError(origin, "state", returnTo);
  if (oauthError || !code) {
    if (isWriteStepUp && oauthError === "access_denied") return redirectWriteDeclined(origin, returnTo);
    const reason = classifyMetaOAuthError({ error: oauthError, reason: oauthErrorReason, description: oauthErrorDescription });
    console.warn("Meta Ads OAuth provider returned an error", {
      error: oauthError ?? "missing_code",
      reason: oauthErrorReason?.slice(0, 120) ?? null,
      mappedReason: reason,
    });
    return redirectWithError(origin, reason, returnTo);
  }

  const redirectUri = new URL("/api/meta-ads/callback", origin).toString();
  let stage = "code_exchange";
  try {
    const shortLived = await exchangeMetaCode({ code, redirectUri, appId, appSecret });
    stage = "long_lived_exchange";
    let token = shortLived;
    try {
      token = await exchangeForLongLivedMetaToken({ accessToken: shortLived.accessToken, appId, appSecret });
    } catch (error) {
      // Some Meta app/login combinations already return a long-lived token and
      // reject the explicit exchange. Keep the validated token and let its
      // debug metadata determine the expiry instead of failing the connection.
      if (!(error instanceof MetaApiError)) throw error;
    }

    stage = "token_validation";
    const [metaUser, tokenInfo] = await Promise.all([
      getMetaUser(token.accessToken),
      debugMetaToken({ accessToken: token.accessToken, appId, appSecret }),
    ]);
    if (tokenInfo.is_valid === false || tokenInfo.user_id && tokenInfo.user_id !== metaUser.id) {
      return redirectWithError(origin, "token", returnTo);
    }
    const scopes = tokenInfo.scopes ?? [];
    if (!scopes.includes("ads_read")) return redirectWithError(origin, "ads_read", returnTo);

    const expirySeconds = tokenInfo.expires_at ?? tokenInfo.data_access_expiration_time ?? null;
    const tokenExpiresAt = expirySeconds
      ? new Date(expirySeconds * 1000)
      : token.expiresInSeconds
        ? new Date(Date.now() + token.expiresInSeconds * 1000)
        : null;
    stage = "connection_persist";
    const [existingConnection] = await db
      .select({
        selectedAdAccountId: metaAdsConnections.selectedAdAccountId,
        initialSyncStatus: metaAdsConnections.initialSyncStatus,
        initialSyncCompletedAt: metaAdsConnections.initialSyncCompletedAt,
        lastSyncStartedAt: metaAdsConnections.lastSyncStartedAt,
        lastSyncCompletedAt: metaAdsConnections.lastSyncCompletedAt,
      })
      .from(metaAdsConnections)
      .where(eq(metaAdsConnections.userId, access.accountId))
      .limit(1);
    const preserveSyncState = isWriteStepUp && existingConnection !== undefined;
    const values = {
      userId: access.accountId,
      metaUserId: metaUser.id,
      metaUserName: metaUser.name,
      accessTokenEncrypted: encrypt(token.accessToken),
      tokenExpiresAt,
      grantedScopes: scopes,
      selectedAdAccountId: preserveSyncState ? existingConnection.selectedAdAccountId ?? null : null,
      status: "connected",
      initialSyncStatus: preserveSyncState ? existingConnection.initialSyncStatus : "pending",
      initialSyncCompletedAt: preserveSyncState ? existingConnection.initialSyncCompletedAt : null,
      lastSyncStartedAt: preserveSyncState ? existingConnection.lastSyncStartedAt : null,
      lastSyncCompletedAt: preserveSyncState ? existingConnection.lastSyncCompletedAt : null,
      lastSyncError: null,
      updatedAt: new Date(),
    };

    await Promise.all([
      db
        .insert(metaAdsConnections)
        .values(values)
        .onConflictDoUpdate({
          target: metaAdsConnections.userId,
          set: { ...values, connectedAt: new Date() },
        }),
      db.update(users).set({ metaAdsConnected: true }).where(eq(users.id, access.accountId)),
    ]);

    if (!preserveSyncState) {
      try {
        await inngest.send(metaAdsAccountConnected.create({ userId: access.accountId }));
      } catch (error) {
        console.error("inngest.send(metaAdsAccountConnected) failed, Meta connection saved anyway", error);
      }
    }

    const writeStatus = isWriteStepUp ? (scopes.includes("ads_management") ? "write_ready" : "write_declined") : "connected";
    revalidateBusinessData(access.accountId);
    const destination = new URL(returnTo ?? "/integrations", origin);
    destination.searchParams.set("meta_ads", writeStatus);
    const response = NextResponse.redirect(destination);
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(MODE_COOKIE);
    response.cookies.delete(RETURN_COOKIE);
    return response;
  } catch (error) {
    const metaError = error instanceof MetaApiError ? { code: error.code, subcode: error.subcode } : null;
    console.error("Meta Ads OAuth callback failed", {
      stage,
      ...metaError,
      message: error instanceof Error ? error.message : "unknown",
    });
    return redirectWithError(origin, stage === "token_validation" ? "token" : stage === "connection_persist" ? "server" : "oauth", returnTo);
  }
}
