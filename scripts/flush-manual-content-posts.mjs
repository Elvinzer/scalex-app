// One-off: purge every content_posts row that is NOT a verified Instagram
// sync, now that manual post entry has been removed entirely (page Contenu's
// form + the /datas smart-import "content_posts" target both gone — see
// lib/content-posts/queries.ts, lib/import/schema.ts). Deliberately NOT
// `where source = 'manual'`: lib/content-posts/queries.ts's old
// deleteContentPost/updateContentPost trusted an exact match on that string,
// which would silently miss a row whose `source` got corrupted/mis-cast by
// some earlier bug. This script inverts that: keep only what's PROVEN
// Instagram (source='instagram' AND external_id set), delete everything
// else. instagram_post_insights (the full-fidelity cache) is never touched —
// the next sync/cron repopulates content_posts normally.
// Run once via `node scripts/flush-manual-content-posts.mjs`.
import fs from "node:fs";
import postgres from "postgres";

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

const NOT_INSTAGRAM_PREDICATE = sql`lower(coalesce(source, '')) <> 'instagram' or external_id is null`;

async function main() {
  const [{ n: totalBefore }] = await sql`select count(*)::int as n from content_posts`;
  const toDelete = await sql`
    select id, user_id, source, external_id
    from content_posts
    where ${NOT_INSTAGRAM_PREDICATE}
  `;

  console.log(`content_posts : ${totalBefore} ligne(s) au total, ${toDelete.length} ligne(s) non-Instagram à supprimer.`);
  const byUser = new Map();
  for (const row of toDelete) byUser.set(row.user_id, (byUser.get(row.user_id) ?? 0) + 1);
  for (const [userId, count] of byUser) console.log(`  user=${userId}: ${count} ligne(s)`);

  if (toDelete.length === 0) {
    console.log("Rien à supprimer.");
    await sql.end();
    return;
  }

  const deleted = await sql`
    delete from content_posts
    where ${NOT_INSTAGRAM_PREDICATE}
    returning id
  `;

  const [{ n: totalAfter }] = await sql`select count(*)::int as n from content_posts`;
  console.log(`${deleted.length} ligne(s) supprimée(s). content_posts : ${totalBefore} -> ${totalAfter} ligne(s) restantes (toutes source='instagram').`);

  await sql.end();
}

main().catch((err) => {
  console.error("FLUSH FAILED:", err);
  process.exit(1);
});
