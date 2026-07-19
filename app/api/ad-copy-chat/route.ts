import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAiProvider } from "@/lib/ai-provider";
import { buildAdCopyPrompt } from "@/lib/ad-copy-prompt-builder";
import { getBusinessProfile } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";

const MAX_MESSAGES = 20;

const requestSchema = z.object({
  offerId: z.string().nullable(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(MAX_MESSAGES),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Session expirée, reconnecte-toi." }, { status: 401 });
  }
  const userId = data.claims.sub as string;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { offerId, messages } = parsed.data;

  if (messages.length >= MAX_MESSAGES) {
    return NextResponse.json(
      { error: "Cette conversation a atteint sa limite de messages — ouvre-la à nouveau pour continuer." },
      { status: 400 }
    );
  }

  // Server always re-fetches the business profile and looks up the offer by
  // id server-side — never trusts a client-sent offer blob.
  const businessProfile = await getBusinessProfile(userId);
  const offer = offerId ? (businessProfile.sales.offers.find((o) => o.id === offerId) ?? null) : null;

  const systemPrompt = buildAdCopyPrompt({ businessProfile, offer });
  const provider = getAiProvider();

  let upstream: Response;
  try {
    upstream = await fetch(provider.baseURL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        stream: true,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre l'IA pour l'instant — réessaie dans un instant." },
      { status: 502 }
    );
  }

  if (upstream.status === 429) {
    return NextResponse.json(
      { error: "Beaucoup de monde utilise l'IA en ce moment, réessaie dans une minute." },
      { status: 429 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "L'IA n'a pas pu répondre — réessaie dans un instant." }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
