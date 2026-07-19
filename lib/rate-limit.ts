import type { NextRequest } from "next/server";

// In-memory fixed-window limiter, per Vercel serverless instance — not
// distributed (a new cold start or a different instance gets a fresh
// counter). Accepted trade-off at the current scale; revisit with a shared
// store (e.g. Upstash Redis) if the app runs multi-region/high-traffic.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
