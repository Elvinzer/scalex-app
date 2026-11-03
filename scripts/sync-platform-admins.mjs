import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const target = process.env.DIRECT_URL;
if (!target) throw new Error("DIRECT_URL is required");
const url = new URL(target);
const localPlaintext = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.searchParams.get("sslmode") === "disable";
const pool = new pg.Pool({ connectionString: target, ssl: localPlaintext ? false : { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();
try {
  const emails = [...new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
  await client.query("begin");
  await client.query("delete from public.platform_admin_emails");
  for (const email of emails) await client.query("insert into public.platform_admin_emails(email) values ($1)", [email]);
  await client.query("update public.businesses b set billing_exempt = true from public.users u where u.id = b.owner_user_id and exists (select 1 from public.platform_admin_emails a where a.email = lower(u.email))");
  await client.query("commit");
  console.log(`Platform admin roster synchronized (${emails.length} entries).`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
