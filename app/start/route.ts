import { NextResponse } from "next/server";
import { z } from "zod";

import { isEarlyAccessMode } from "@/lib/early-access";

const startQuerySchema = z.object({
  intent: z.enum(["trial", "diagnostic"]).optional(),
  plan: z.enum(["solo", "team"]).optional(),
  billing: z.enum(["monthly", "annual"]).optional(),
});

const trackingParameters = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "source"] as const;

export function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const parsed = startQuerySchema.safeParse(Object.fromEntries(requestUrl.searchParams.entries()));
  const destination = new URL(isEarlyAccessMode() ? "/early-access" : "/sign-in", request.url);

  if (parsed.success) {
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value) destination.searchParams.set(key, value);
    }
  }

  for (const key of trackingParameters) {
    const value = requestUrl.searchParams.get(key);
    if (value) destination.searchParams.set(key, value);
  }

  return NextResponse.redirect(destination);
}
