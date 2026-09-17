import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { getCrmExtensionRelease, isChromeExtensionVersion } from "@/lib/crm/extension-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const releaseQuerySchema = z.object({
  currentVersion: z.string().refine(isChromeExtensionVersion, "invalid_version").optional(),
}).strict();

export async function GET(request: NextRequest) {
  if (isRateLimited(`crm-extension-release:${getClientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = releaseQuerySchema.safeParse(query);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const release = getCrmExtensionRelease(parsed.data.currentVersion);
  return NextResponse.json(
    { data: release },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
