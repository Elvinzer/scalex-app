import { createHash } from "node:crypto";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function fingerprintInsight(value: {
  sourceType: string;
  sourceId: string;
  metricKey: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  snapshot: unknown;
}): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
