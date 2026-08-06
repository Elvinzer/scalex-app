import { NextResponse, type NextRequest } from "next/server";

import { resolveHandleForLegacySlug } from "@/lib/native-booking/queries";

// Rétrocompat : les anciens endpoints /api/public/booking/{slug} redirigent vers
// leur équivalent namespacé /api/public/booking/{handle}/{slug}. GET en 301,
// POST en 308 (préserve la méthode et le corps). Le segment est nommé
// `[handle]` pour partager le préfixe dynamique avec la route canonique ; sa
// valeur reste ici l’ancien slug.
type RouteContext = { params: Promise<{ handle: string }> };

async function redirectToNamespaced(request: NextRequest, slug: string, status: 301 | 308) {
  const handle = await resolveHandleForLegacySlug(slug);
  if (!handle) return NextResponse.json({ error: "Cette page de réservation n’est plus disponible." }, { status: 404 });
  const target = new URL(request.nextUrl.toString());
  target.pathname = `/api/public/booking/${handle}/${slug}`;
  return NextResponse.redirect(target, status);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { handle } = await context.params;
  return redirectToNamespaced(request, handle, 301);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { handle } = await context.params;
  return redirectToNamespaced(request, handle, 308);
}
