export function resolveMetaTouchpointCampaign(
  row: { campaignExternalId: string | null; adSetExternalId: string | null; adExternalId: string | null },
  campaignExternalIds: ReadonlySet<string>,
  adSetCampaigns: ReadonlyMap<string, string>,
  adCampaigns: ReadonlyMap<string, string>,
): string | null {
  if (row.campaignExternalId && campaignExternalIds.has(row.campaignExternalId)) return row.campaignExternalId;
  if (row.adSetExternalId) {
    const campaignExternalId = adSetCampaigns.get(row.adSetExternalId);
    if (campaignExternalId) return campaignExternalId;
  }
  if (row.adExternalId) return adCampaigns.get(row.adExternalId) ?? null;
  return null;
}
