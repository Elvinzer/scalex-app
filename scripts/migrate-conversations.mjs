// One-off migration for the Copilote unification chantier: today
// `agent_chat_messages` has no conversation concept at all — one implicit
// thread per (user_id, agent_key). This creates one `conversations` row per
// existing (user_id, agent_key) bucket and backfills `conversation_id` on
// every message in it, so no history is lost when the app switches to
// conversation_id-keyed persistence. Run once, before flipping
// conversation_id to NOT NULL in db/schema.ts.
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

// Same labels app/(app)/copilote pages already show for these levers
// (lib/falco-skins.ts's AGENT_KEY_TO_TOPIC_LABEL) — kept in sync manually,
// this script only ever runs once against the 3 buckets that exist today.
const TOPIC_INFO = {
  general: { topicType: "general", topicKey: null, topicLabel: null },
  email_marketing: { topicType: "lever", topicKey: "email_marketing", topicLabel: "Emailing" },
  content: { topicType: "lever", topicKey: "content", topicLabel: "Contenu" },
};

function truncate(text, max) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function titleFor(topicLabel, firstUserMessage) {
  if (topicLabel && firstUserMessage) return `${topicLabel} — ${truncate(firstUserMessage, 40)}`;
  if (topicLabel) return topicLabel;
  if (firstUserMessage) return truncate(firstUserMessage, 60);
  return "Nouvelle conversation";
}

async function main() {
  const buckets = await sql`
    select distinct user_id, agent_key
    from agent_chat_messages
    where conversation_id is null
  `;
  console.log(`Found ${buckets.length} (user_id, agent_key) bucket(s) to migrate.`);

  for (const bucket of buckets) {
    const info = TOPIC_INFO[bucket.agent_key];
    if (!info) {
      console.warn(`  SKIPPED unknown agent_key "${bucket.agent_key}" for user ${bucket.user_id} — no TOPIC_INFO entry, add one and rerun.`);
      continue;
    }

    const [firstUserRow] = await sql`
      select content from agent_chat_messages
      where user_id = ${bucket.user_id} and agent_key = ${bucket.agent_key} and role = 'user'
      order by created_at asc limit 1
    `;
    const [lastRow] = await sql`
      select created_at from agent_chat_messages
      where user_id = ${bucket.user_id} and agent_key = ${bucket.agent_key}
      order by created_at desc limit 1
    `;

    const title = titleFor(info.topicLabel, firstUserRow?.content ?? null);

    const [conversation] = await sql`
      insert into conversations (user_id, title, topic_type, topic_key, topic_label, created_at, updated_at)
      values (${bucket.user_id}, ${title}, ${info.topicType}, ${info.topicKey}, ${info.topicLabel}, now(), ${lastRow?.created_at ?? sql`now()`})
      returning id
    `;

    const updated = await sql`
      update agent_chat_messages
      set conversation_id = ${conversation.id}
      where user_id = ${bucket.user_id} and agent_key = ${bucket.agent_key} and conversation_id is null
      returning id
    `;

    console.log(`  user=${bucket.user_id} agent_key=${bucket.agent_key} -> conversation ${conversation.id} ("${title}"), ${updated.length} message(s) backfilled`);
  }

  const [{ n: orphaned }] = await sql`select count(*) as n from agent_chat_messages where conversation_id is null`;
  console.log(`\nRemaining orphaned messages (must be 0 before making conversation_id NOT NULL): ${orphaned}`);

  await sql.end();
}

main().catch((err) => {
  console.error("MIGRATION FAILED:", err);
  process.exit(1);
});
