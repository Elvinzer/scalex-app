// One-off seed for the `lever_resources` table (lib/levers/resources.ts) —
// curated YouTube videos shown on /demarrer/[leverKey]'s "Apprends en
// vidéo" section. Same pattern as scripts/seed-levers-catalog.mjs: plain
// .mjs, run via `node scripts/seed-lever-resources.mjs` against .env.local,
// idempotent via full delete+reinsert (not an upsert).
//
// Was deliberately seeded EMPTY at launch — the "Démarrer un levier" brief
// is explicit: no automatic YouTube search, only manually curated, verified
// links (never invented or unverified). Now populated: one video per lever,
// each found via web search and individually verified against YouTube's
// public oEmbed endpoint (the same one lib/levers/resources.ts uses at
// render time) before being added here — none of these URLs are guessed.
// durationLabel is left null throughout (no reliable way to verify exact
// duration without a real player fetch) — see lever-video-grid.tsx, an
// absent durationLabel just omits the corner badge, doesn't break anything.
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

const RESOURCES = [
  // --- ACQUISITION ---
  { leverKey: "lead_magnet", youtubeUrl: "https://www.youtube.com/watch?v=sJkMoKkxET0", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "email_marketing", youtubeUrl: "https://www.youtube.com/watch?v=oeMD1gllOm4", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "newsletter", youtubeUrl: "https://www.youtube.com/watch?v=zaJLCQ_pMU0", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "seo_blog", youtubeUrl: "https://www.youtube.com/watch?v=TkNiCvYKagQ", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "podcast", youtubeUrl: "https://www.youtube.com/watch?v=O9bqtJ4GQZs", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "retargeting", youtubeUrl: "https://www.youtube.com/watch?v=1KqdSzKPknA", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "referral", youtubeUrl: "https://www.youtube.com/watch?v=wnQAy3spFCM", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "ads", youtubeUrl: "https://www.youtube.com/watch?v=D1YhfZIde3I", durationLabel: null, lang: "fr", sortOrder: 1 },

  // --- VENTE ---
  { leverKey: "vsl", youtubeUrl: "https://www.youtube.com/watch?v=9kt_M3qTmJ8", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "webinar", youtubeUrl: "https://www.youtube.com/watch?v=FXkkyk76qeY", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "sequence_relance_non_acheteurs", youtubeUrl: "https://www.youtube.com/watch?v=BqZIYdpEq5I", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "order_bump", youtubeUrl: "https://www.youtube.com/watch?v=gjPVeZyjejk", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "downsell", youtubeUrl: "https://www.youtube.com/watch?v=sN-dtweypcM", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "garantie", youtubeUrl: "https://www.youtube.com/watch?v=Aid-FRCLCtE", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "preuve_sociale_page", youtubeUrl: "https://www.youtube.com/watch?v=rF-MB_Fn3rg", durationLabel: null, lang: "fr", sortOrder: 1 },

  // --- DÉLIVRABILITÉ ---
  { leverKey: "upsell_ascension", youtubeUrl: "https://www.youtube.com/watch?v=kER1NUGQJQo", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "onboarding_structure", youtubeUrl: "https://www.youtube.com/watch?v=W7EKEBs5XeQ", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "collecte_temoignages_systematique", youtubeUrl: "https://www.youtube.com/watch?v=svs42vHKAus", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "communaute_clients", youtubeUrl: "https://www.youtube.com/watch?v=6eFqUKJUzDg", durationLabel: null, lang: "fr", sortOrder: 1 },
  { leverKey: "reactivation_anciens_clients", youtubeUrl: "https://www.youtube.com/watch?v=IVVPRjUpKj4", durationLabel: null, lang: "fr", sortOrder: 1 },
];

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
