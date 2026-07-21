// One-off: adds every current users.email to ADMIN_EMAILS in .env.local
// (comma-separated allowlist checked by app/admin/layout.tsx / lib/admin.ts).
// Merges with whatever is already set rather than overwriting it. Run once
// via `node scripts/grant-admin-emails.mjs`. Mirrors scripts/seed-benchmarks.mjs's
// pattern for reading .env.local directly (no ts-node/tsx runner configured).
import fs from "node:fs";
import postgres from "postgres";

const ENV_PATH = ".env.local";
const raw = fs.readFileSync(ENV_PATH, "utf8");
const lines = raw.split("\n");

const env = Object.fromEntries(
  lines
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sql = postgres(env.DATABASE_URL, { prepare: false });
const rows = await sql`select distinct email from users order by email`;
await sql.end();

const dbEmails = rows.map((r) => r.email);
const existing = (env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

const merged = [...new Set([...existing, ...dbEmails].map((e) => e.toLowerCase()))];
const nextValue = merged.join(",");

let found = false;
const nextLines = lines.map((line) => {
  if (line.startsWith("ADMIN_EMAILS=")) {
    found = true;
    return `ADMIN_EMAILS=${nextValue}`;
  }
  return line;
});
if (!found) nextLines.push(`ADMIN_EMAILS=${nextValue}`);

fs.writeFileSync(ENV_PATH, nextLines.join("\n"));

console.log(`${dbEmails.length} users found in DB, ${merged.length} emails now in ADMIN_EMAILS:`);
console.log(merged.join("\n"));
