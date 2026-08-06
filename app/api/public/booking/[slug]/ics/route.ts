import { NextResponse, type NextRequest } from "next/server";

import { resolveHandleForLegacySlug } from "@/lib/native-booking/queries";

// Rétrocompat : les anciens liens ICS /api/public/booking/{slug}/ics (déjà
// présents dans des e-mails envoyés) redirigent en 301 vers l'URL namespacée,
// en préservant le token en query.
type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const handle = await resolveHandleForLegacySlug(slug);
  if (!handle) return NextResponse.json({ error: "Ce lien de calendrier n’est plus valide." }, { status: 404 });
  const target = new URL(request.nextUrl.toString());
  target.pathname = `/api/public/booking/${handle}/${slug}/ics`;
  return NextResponse.redirect(target, 301);
}
