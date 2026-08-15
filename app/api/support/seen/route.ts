import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";

export async function POST() {
  const identity = await getAuthIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db.update(users).set({ supportLastSeenAt: new Date() }).where(eq(users.id, identity.userId));
  return NextResponse.json({ ok: true });
}

