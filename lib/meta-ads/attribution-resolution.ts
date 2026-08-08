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

export function metaSalesCoverageRate(
  rows: ReadonlyArray<{ metaTouchpointId: string | null }>,
  knownTouchpointIds: ReadonlySet<string>,
): number | null {
  if (rows.length === 0) return null;
  const attached = rows.filter((row) => row.metaTouchpointId !== null && knownTouchpointIds.has(row.metaTouchpointId)).length;
  return attached / rows.length;
}
