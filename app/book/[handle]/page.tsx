import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { resolveHandleForLegacySlug } from "@/lib/native-booking/queries";

// Rétrocompat : les anciens liens /book/{slug} (déjà diffusés en e-mail/rappels)
// redirigent en 301 vers l’URL canonique namespacée /book/{handle}/{slug}, en
// préservant les paramètres de gestion/annulation/UTM. Le nom de segment
// `[handle]` est volontairement partagé avec la route canonique : sa valeur
// reste ici l’ancien slug, uniquement pour éviter un conflit de route Next.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function buildQueryString(searchParams: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function LegacyPublicBookingRoute({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ handle }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const slug = handle;
  const resolvedHandle = await resolveHandleForLegacySlug(slug);
  if (!resolvedHandle) notFound();
  permanentRedirect(`/book/${resolvedHandle}/${slug}${buildQueryString(resolvedSearchParams)}`);
}
