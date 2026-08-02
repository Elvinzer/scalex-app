// One-off seed for the `lever_resources` table (lib/levers/resources.ts) —
// curated YouTube videos shown on /demarrer/[leverKey]'s "Apprends en
// vidéo" section. Same pattern as scripts/seed-levers-catalog.mjs: plain
// .mjs, run via `node scripts/seed-lever-resources.mjs` against .env.local,
// idempotent via full delete+reinsert (not an upsert).
//
// Deliberately seeded EMPTY at launch — the "Démarrer un levier" brief is
// explicit: no automatic YouTube search, only manually curated, verified
// links (never invented or unverified). Add real videos here (a real
// youtubeUrl per row is all that's required — title/channel/thumbnail are
// fetched live from YouTube's oEmbed at render time, see
// lib/levers/resources.ts) whenever some have been picked; until then the
// "Apprends en vidéo" section stays hidden everywhere, per
// getLeverVideos's "hide the section, don't show an empty one" rule.
//
// Shape once populated:
//   { leverKey: "email_marketing", youtubeUrl: "https://youtube.com/watch?v=...", durationLabel: "12 min", lang: "fr", sortOrder: 1 }
import postgres from "postgres";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sql = postgres(env.DATABASE_URL, { prepare: false });

const RESOURCES = [];

await sql`delete from lever_resources`;

for (const resource of RESOURCES) {
  await sql`
    insert into lever_resources (lever_key, youtube_url, duration_label, lang, sort_order)
    values (${resource.leverKey}, ${resource.youtubeUrl}, ${resource.durationLabel ?? null}, ${resource.lang ?? "fr"}, ${resource.sortOrder})
  `;
}

const rows = await sql`select count(*)::int as n from lever_resources`;
console.log(`Seeded ${rows[0].n} lever resources`);

await sql.end();
