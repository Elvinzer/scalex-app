import type { NextRequest } from "next/server";

// In-memory fixed-window limiter, per Vercel serverless instance. It is not
// distributed, but it still needs a hard memory bound because keys are
// derived from public request data.
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10_000;
const MAX_KEY_LENGTH = 256;
let lastCleanupAt = 0;

function normalizeKey(key: string): string {
  return key.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_KEY_LENGTH) || "unknown";
}

function cleanupExpiredBuckets(now: number): void {
  if (now - lastCleanupAt < 10_000 && buckets.size < MAX_BUCKETS) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

export function isRateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  cleanupExpiredBuckets(now);
  const normalizedKey = normalizeKey(key);
  const bucket = buckets.get(normalizedKey);
  if (!bucket || now > bucket.resetAt) {
    if (!bucket && buckets.size >= MAX_BUCKETS) return true;
    buckets.set(normalizedKey, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return normalizeKey(forwarded || realIp || "unknown").slice(0, 128);
}
