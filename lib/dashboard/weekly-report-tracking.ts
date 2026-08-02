"use server";

import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

export async function recordWeeklyReportViewed(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return;
  await track("weekly_report_viewed", data.claims.sub as string);
}
