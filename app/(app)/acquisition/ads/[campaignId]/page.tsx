import { redirect } from "next/navigation";
import { z } from "zod";

const campaignIdSchema = z.string().uuid();
const aliasSearchParamsSchema = z.object({
  meta_days: z.string().optional(),
  meta_ads: z.enum(["write_declined", "write_ready"]).optional(),
});

/**
 * Compatibility route for the OpenSpec URL contract.
 *
 * The Meta-specific segment remains canonical so it can coexist with the
 * existing manual Ads surface. Validation happens before redirecting so an
 * arbitrary path value is never reflected into the destination URL.
 */
export default async function MetaCampaignAliasPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ meta_days?: string; meta_ads?: string }>;
}) {
  const { campaignId } = await params;
  const parsedCampaignId = campaignIdSchema.safeParse(campaignId);
  if (!parsedCampaignId.success) redirect("/acquisition/ads");

  const search = aliasSearchParamsSchema.safeParse(await searchParams);
  const query = new URLSearchParams();
  if (search.success && search.data.meta_days) query.set("meta_days", search.data.meta_days);
  if (search.success && search.data.meta_ads) query.set("meta_ads", search.data.meta_ads);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  redirect(`/acquisition/ads/meta/${parsedCampaignId.data}${suffix}`);
}
