import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { calculateFreeDiagnostic, freeDiagnosticInputSchema } from "@/lib/free-diagnostic";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { getResendClient, isResendConfigured } from "@/lib/resend-client";

const requestSchema = z.object({
  email: z.string().trim().email().max(320),
  diagnostic: freeDiagnosticInputSchema,
  locale: z.enum(["fr", "en"]).default("fr"),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(`free-diagnostic-email:${ip}`, 5)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { email, diagnostic, locale } = parsed.data;
  const result = calculateFreeDiagnostic(diagnostic);
  const bottleneck = result.bottleneck ?? (locale === "fr" ? "à mesurer" : "to be measured");
  const score = result.score === null ? (locale === "fr" ? "à calculer" : "to be calculated") : `${result.score}/100`;
  const gain = result.estimatedGain === null ? (locale === "fr" ? "à calculer" : "to be calculated") : `${result.estimatedGain} €`;
  const subject = locale === "fr" ? "Ton diagnostic Minaly" : "Your Minaly diagnostic";
  const text = locale === "fr"
    ? `Ton diagnostic Minaly\n\nScale Score : ${score}\nGoulot prioritaire : ${bottleneck}\nGain mensuel estimé : ${gain}\n\nCes chiffres sont une estimation basée sur les données saisies. Connecte-toi à Minaly pour les affiner et passer à l'action.`
    : `Your Minaly diagnostic\n\nScale Score: ${score}\nPriority bottleneck: ${bottleneck}\nEstimated monthly gain: ${gain}\n\nThese figures are estimates based on the data you entered. Sign in to Minaly to refine them and take action.`;

  if (isResendConfigured()) {
    await getResendClient().emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Minaly <hello@minaly.io>",
      to: [email],
      subject,
      text,
    });
  }

  return NextResponse.json({ ok: true });
}
