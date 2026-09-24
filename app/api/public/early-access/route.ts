import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { earlyAccessSignups } from "@/db/schema";
import { track } from "@/lib/analytics";
import { EARLY_ACCESS_CONSENT_VERSION } from "@/lib/early-access";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

const earlyAccessSignupSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  locale: z.enum(["fr", "en"]),
  source: z.string().trim().max(100).nullable().optional(),
  utmSource: z.string().trim().max(200).nullable().optional(),
  utmMedium: z.string().trim().max(200).nullable().optional(),
  utmCampaign: z.string().trim().max(200).nullable().optional(),
  utmContent: z.string().trim().max(200).nullable().optional(),
  utmTerm: z.string().trim().max(200).nullable().optional(),
  referrer: z.string().trim().max(2048).nullable().optional(),
});

function emptyToNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(`early-access:ip:${ip}`, 30)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const parsed = earlyAccessSignupSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const emailNormalized = parsed.data.email.toLowerCase();
  if (isRateLimited(`early-access:email:${emailNormalized}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const referrer =
    emptyToNull(parsed.data.referrer) ?? emptyToNull(request.headers.get("referer")?.slice(0, 2048));

  try {
    const [signup] = await db
      .insert(earlyAccessSignups)
      .values({
        firstName: parsed.data.firstName,
        email: parsed.data.email,
        emailNormalized,
        locale: parsed.data.locale,
        source: emptyToNull(parsed.data.source),
        utmSource: emptyToNull(parsed.data.utmSource),
        utmMedium: emptyToNull(parsed.data.utmMedium),
        utmCampaign: emptyToNull(parsed.data.utmCampaign),
        utmContent: emptyToNull(parsed.data.utmContent),
        utmTerm: emptyToNull(parsed.data.utmTerm),
        referrer,
        consentVersion: EARLY_ACCESS_CONSENT_VERSION,
      })
      .onConflictDoNothing({ target: earlyAccessSignups.emailNormalized })
      .returning({ id: earlyAccessSignups.id });

    void track(signup ? "early_access_success" : "early_access_duplicate", crypto.randomUUID(), {
      locale: parsed.data.locale,
      source: emptyToNull(parsed.data.source),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Early access signup persistence failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
