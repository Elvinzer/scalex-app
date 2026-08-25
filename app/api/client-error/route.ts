import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAuthIdentity } from "@/lib/auth/request";
import { isRateLimited } from "@/lib/rate-limit";

// Best-effort sink for client-side crashes caught by (app)/error.tsx. Browser
// console.error never reaches Vercel, so the error boundary POSTs the crash
// here and this handler re-logs it server-side, where it lands in the Vercel
// runtime logs tied to the userId. Kept deliberately small: it only writes a
// log line, never touches the database.
const payloadSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  stack: z.string().trim().max(8000).optional(),
  componentStack: z.string().trim().max(8000).optional(),
  digest: z.string().trim().max(200).optional(),
  url: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const identity = await getAuthIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Per-user cap: a crash loop must not flood the logs. Keyed on the userId,
  // not the IP, so it survives shared networks without punishing real users.
  if (isRateLimited(`client-error:${identity.userId}`, 20)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { message, stack, componentStack, digest, url } = parsed.data;
  console.error("[client-error]", {
    userId: identity.userId,
    digest: digest ?? null,
    url: url ?? null,
    message,
    stack: stack ?? null,
    componentStack: componentStack ?? null,
  });

  return NextResponse.json({ ok: true });
}
