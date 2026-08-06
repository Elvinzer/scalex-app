import { NextResponse, type NextRequest } from "next/server";

import { resolveHandleForLegacySlug } from "@/lib/native-booking/queries";

// Rétrocompat : les anciens liens ICS /api/public/booking/{slug}/ics (déjà
// présents dans des e-mails envoyés) redirigent en 301 vers l’URL namespacée,
// en préservant le token en query. Le paramètre interne partage le nom du
// segment canonique pour éviter un conflit de route Next.
type RouteContext = { params: Promise<{ handle: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { handle } = await context.params;
  const slug = handle;
  const resolvedHandle = await resolveHandleForLegacySlug(slug);
  if (!resolvedHandle) return NextResponse.json({ error: "Ce lien de calendrier n’est plus valide." }, { status: 404 });
  const target = new URL(request.nextUrl.toString());
  target.pathname = `/api/public/booking/${resolvedHandle}/${slug}/ics`;
  return NextResponse.redirect(target, 301);
}
