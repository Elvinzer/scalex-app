import type { Metadata } from "next";
import { permanentRedirect, notFound } from "next/navigation";

import { resolveHandleForLegacySlug } from "@/lib/native-booking/queries";

// Rétrocompat : les anciens liens /book/{slug} (déjà diffusés en e-mail/rappels)
// redirigent en 301 vers l'URL canonique namespacée /book/{handle}/{slug}, en
// préservant les paramètres de gestion/annulation/UTM.
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
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const handle = await resolveHandleForLegacySlug(slug);
  if (!handle) notFound();
  permanentRedirect(`/book/${handle}/${slug}${buildQueryString(resolvedSearchParams)}`);
}
