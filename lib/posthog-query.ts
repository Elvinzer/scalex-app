import { requireEnv } from "@/lib/utils";

// Single point of contact with PostHog's HogQL Query API — the /admin
// dashboard's 4 blocks are pure event-analytics questions, and PostHog
// already stores every event, so querying it directly here avoids
// maintaining a second event log in Postgres for no reason. Requires a
// PERSONAL API key (Project Settings > API Keys), distinct from the
// project key used by lib/analytics.ts/lib/analytics-client.ts, and
// assumes PostHog Cloud (HogQL Query API availability).
async function runHogQL(query: string): Promise<unknown[][]> {
  const projectId = requireEnv("POSTHOG_PROJECT_ID");
  const personalApiKey = requireEnv("POSTHOG_PERSONAL_API_KEY");
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  const response = await fetch(`${host}/api/projects/${projectId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${personalApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`PostHog HogQL query failed: ${response.status}`);
  }

  const data = (await response.json()) as { results?: unknown[][] };
  return data.results ?? [];
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

// Block 1 — north star: users with >=1 improve_chat_opened in the last 7
// days, plus the same count over each of the last 8 weekly buckets.
export async function getNorthStarCount(): Promise<number> {
  const rows = await runHogQL(
    `SELECT count(DISTINCT person_id) FROM events WHERE event = 'improve_chat_opened' AND timestamp > now() - INTERVAL 7 DAY`
  );
  return toNumber(rows[0]?.[0]);
}

export async function getNorthStarTrend(): Promise<{ weekStart: string; count: number }[]> {
  const rows = await runHogQL(
    `SELECT toStartOfWeek(timestamp) AS week, count(DISTINCT person_id) AS n
     FROM events
     WHERE event = 'improve_chat_opened' AND timestamp > now() - INTERVAL 8 WEEK
     GROUP BY week
     ORDER BY week`
  );
  return rows.map((row) => ({ weekStart: String(row[0]), count: toNumber(row[1]) }));
}

// Block 2 — activation funnel, cohort = signups in the last 30 days.
// Computed as 5 separate counts (not one HogQL funnel() call) — simpler
// and more debuggable, and this is the most syntax-uncertain part of the
// whole chantier (no live PostHog project to dry-run against).
const FUNNEL_STEPS: { label: string; event: string; extraWhere?: string }[] = [
  { label: "Inscriptions", event: "signup" },
  { label: "Onboarding complété", event: "onboarding_step_completed", extraWhere: "JSONExtractInt(properties, 'step') = 3" },
  { label: "Activation atteinte", event: "activation_reached" },
  { label: "Chat engagé (3e message)", event: "improve_chat_engaged" },
  { label: "Check-in hebdo fait", event: "weekly_checkin_completed" },
];

export async function getActivationFunnel(): Promise<{ step: string; count: number }[]> {
  const cohortFilter = `person_id IN (SELECT DISTINCT person_id FROM events WHERE event = 'signup' AND timestamp > now() - INTERVAL 30 DAY)`;

  const results: { step: string; count: number }[] = [];
  for (const { label, event, extraWhere } of FUNNEL_STEPS) {
    const conditions = [`event = '${event}'`, cohortFilter, extraWhere].filter(Boolean).join(" AND ");
    const rows = await runHogQL(`SELECT count(DISTINCT person_id) FROM events WHERE ${conditions}`);
    results.push({ step: label, count: toNumber(rows[0]?.[0]) });
  }
  return results;
}

// Block 3 — median minutes between signup and activation_reached, over the
// last 30 days. minutes_since_signup is already carried on the event
// property (see lib/analytics.ts's callers), no timestamp math needed here.
export async function getMedianActivationMinutes(): Promise<number | null> {
  const rows = await runHogQL(
    `SELECT median(JSONExtractFloat(properties, 'minutes_since_signup'))
     FROM events
     WHERE event = 'activation_reached' AND timestamp > now() - INTERVAL 30 DAY`
  );
  const value = rows[0]?.[0];
  return value === null || value === undefined ? null : toNumber(value);
}

// Block 4 — % of users with a weekly_checkin_completed in the last 7 days
// who also have one in the 7 days before that. Two simple person_id sets
// intersected in JS rather than one join query, for the same
// debuggability reason as the funnel above.
export async function getTwoWeekRetentionRate(): Promise<number | null> {
  const [thisWeekRows, lastWeekRows] = await Promise.all([
    runHogQL(`SELECT DISTINCT person_id FROM events WHERE event = 'weekly_checkin_completed' AND timestamp > now() - INTERVAL 7 DAY`),
    runHogQL(
      `SELECT DISTINCT person_id FROM events WHERE event = 'weekly_checkin_completed' AND timestamp <= now() - INTERVAL 7 DAY AND timestamp > now() - INTERVAL 14 DAY`
    ),
  ]);

  const thisWeekIds = new Set(thisWeekRows.map((row) => String(row[0])));
  const lastWeekIds = new Set(lastWeekRows.map((row) => String(row[0])));
  if (thisWeekIds.size === 0) return null;

  let retained = 0;
  for (const id of thisWeekIds) {
    if (lastWeekIds.has(id)) retained += 1;
  }
  return Math.round((retained / thisWeekIds.size) * 100);
}
