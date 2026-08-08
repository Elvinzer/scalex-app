export type MetaUtmFields = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
};

export type MetaTrackingFields = MetaUtmFields & {
  // The opaque first-party value may be preserved by a scheduler or a
  // checkout provider. It is resolved against our database before use; it is
  // never stored in a call or sale row.
  metaTouchpointToken: string | null;
  metaCampaignExternalId: string | null;
  metaAdSetExternalId: string | null;
  metaAdExternalId: string | null;
};

type RecordValue = Record<string, unknown>;

const MAX_TRACKING_VALUE_LENGTH = 256;
const TRACKING_CONTAINERS = ["tracking", "tracking_params", "trackingParams", "metadata", "metaData", "customFields"];

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null;
}

function normalizeTrackingValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized.slice(0, MAX_TRACKING_VALUE_LENGTH);
}

function normalizeMetaIdentifier(value: unknown): string | null {
  const normalized = normalizeTrackingValue(value);
  return normalized && /^[a-zA-Z0-9_-]{1,128}$/.test(normalized) ? normalized : null;
}

function aliasesFor(field: keyof MetaUtmFields): string[] {
  const suffix = field.slice(3);
  const snake = `utm_${suffix.toLowerCase()}`;
  return [field, snake];
}

function fieldFromRecord(record: RecordValue, aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const value = normalizeTrackingValue(record[alias]);
    if (value) return value;
  }

  for (const containerName of TRACKING_CONTAINERS) {
    const container = record[containerName];
    if (Array.isArray(container)) {
      for (const item of container) {
        const itemRecord = asRecord(item);
        if (!itemRecord) continue;
        const label = normalizeTrackingValue(itemRecord.name ?? itemRecord.key ?? itemRecord.field ?? itemRecord.question);
        if (label && aliases.some((alias) => label.toLowerCase() === alias.toLowerCase())) {
          const value = normalizeTrackingValue(itemRecord.value ?? itemRecord.answer ?? itemRecord.response);
          if (value) return value;
        }
      }
      continue;
    }
    const nested = asRecord(container);
    if (!nested) continue;
    for (const alias of aliases) {
      const value = normalizeTrackingValue(nested[alias]);
      if (value) return value;
    }
  }

  return null;
}

function tokenFromRecord(record: RecordValue): string | null {
  const aliases = ["sx_mt", "metaTouchpointToken", "meta_touchpoint_token"];
  const value = fieldFromRecord(record, aliases);
  return value && /^[a-f0-9]{64}$/i.test(value) ? value : null;
}

function identifierFromRecords(records: readonly RecordValue[], aliases: readonly string[]): string | null {
  for (const record of records) {
    const value = fieldFromRecord(record, aliases);
    const identifier = normalizeMetaIdentifier(value);
    if (identifier) return identifier;
  }
  return null;
}

export function buildMetaTrackingUrl(
  destinationUrl: string,
  params: {
    touchpointToken: string;
    campaignExternalId?: string | null;
    adSetExternalId?: string | null;
    adExternalId?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
  },
): string {
  const url = new URL(destinationUrl);
  url.searchParams.set("sx_mt", params.touchpointToken);
  const identifiers: Array<[string, string | null | undefined]> = [
    ["campaign_id", params.campaignExternalId],
    ["adset_id", params.adSetExternalId],
    ["ad_id", params.adExternalId],
  ];
  for (const [key, value] of identifiers) {
    const normalized = normalizeMetaIdentifier(value);
    if (normalized) url.searchParams.set(key, normalized);
  }
  const utms: Array<[string, string | null | undefined]> = [
    ["utm_source", params.utmSource],
    ["utm_medium", params.utmMedium],
    ["utm_campaign", params.utmCampaign],
    ["utm_content", params.utmContent],
    ["utm_term", params.utmTerm],
  ];
  for (const [key, value] of utms) {
    const normalized = normalizeTrackingValue(value);
    if (normalized) url.searchParams.set(key, normalized);
  }
  return url.toString();
}

export function readMetaTracking(...sources: unknown[]): MetaTrackingFields {
  const records = sources.map(asRecord).filter((value): value is RecordValue => Boolean(value));
  const read = (field: keyof MetaUtmFields): string | null => {
    const aliases = aliasesFor(field);
    for (const record of records) {
      const value = fieldFromRecord(record, aliases);
      if (value) return value;
    }
    return null;
  };

  let metaTouchpointToken: string | null = null;
  for (const record of records) {
    metaTouchpointToken = tokenFromRecord(record);
    if (metaTouchpointToken) break;
  }

  return {
    utmSource: read("utmSource"),
    utmMedium: read("utmMedium"),
    utmCampaign: read("utmCampaign"),
    utmContent: read("utmContent"),
    utmTerm: read("utmTerm"),
    metaTouchpointToken,
    metaCampaignExternalId: identifierFromRecords(records, ["campaign_id", "campaignId"]),
    metaAdSetExternalId: identifierFromRecords(records, ["adset_id", "ad_set_id", "adSetId"]),
    metaAdExternalId: identifierFromRecords(records, ["ad_id", "adId"]),
  };
}
