import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

// Unlike weekly-email-click, this mutates (weeklyEmailEnabled = false), so
// the token is verified — a bare userId in the URL would let anyone
// unsubscribe anyone else.
export async function GET(request: NextRequest) {
  if (isRateLimited(`unsubscribe:${getClientIp(request)}`, 20)) {
    return NextResponse.json({ error: "Trop de requêtes, réessaie plus tard." }, { status: 429 });
  }

  const userId = request.nextUrl.searchParams.get("u");
  const token = request.nextUrl.searchParams.get("token");

  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  }

  await db.update(users).set({ weeklyEmailEnabled: false }).where(eq(users.id, userId));

  return new NextResponse("Tu ne recevras plus l'email hebdomadaire de Scale X.", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
