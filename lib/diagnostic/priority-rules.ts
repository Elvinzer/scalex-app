import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { db } from "@/db";
import { priorityRules } from "@/db/schema";

export type PriorityRuleCondition =
  | "lever_revenue_gate"
  | "lever_requires_main_offer"
  | "metric_near_benchmark"
  | "top_funnel_when_closing_leaks"
  | "quick_win_low_effort";

export type PriorityRule = {
  id: string;
  condition: PriorityRuleCondition;
  params: Record<string, number | string>;
  factor: number;
  reasonTemplate: string;
};

// Config data, not code — see db/schema.ts's comment above priorityRules
// for the params shape expected per condition. cache()-wrapped like
// getDiagnosticBenchmarks/getLeversCatalog: read by both /diagnostic and
// /dashboard in the same request, and unstable_cache-wrapped underneath
// (seed-script-only data, no in-app writes) so it's not re-queried from
// Postgres on every request either.
const getPriorityRulesCached = unstable_cache(
  async (): Promise<PriorityRule[]> => {
    const rows = await db.select().from(priorityRules).where(eq(priorityRules.isActive, true));

    return rows.map((row) => ({
      id: row.id,
      condition: row.condition,
      params: row.params,
      factor: row.factor,
      reasonTemplate: row.reasonTemplate,
    }));
  },
  ["priority-rules"],
  { revalidate: 3600 }
);

export const getPriorityRules = cache(getPriorityRulesCached);
