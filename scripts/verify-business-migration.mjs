import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";

const BASE = "6ab432981e5d5e3638f437de5f4aef079c068ab2";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "docs/reviews/multi-business/evidence");
const execute = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const PLAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const started = new Date();
const report = { status: "running", startedAt: started.toISOString(), baseCommit: BASE, database: null, assertions: [], commands: [] };
let rawLog = "Disposable local migration verification. No remote database or vendor calls.\n";
let admin;
let client;
let temporarySchema;

function identifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function check(name, condition, details = {}) {
  assert.ok(condition, name);
  report.assertions.push({ name, passed: true, ...details });
  if (!name.startsWith("validated foreign key")) console.log(`PASS ${name}`);
}

async function command(label, binary, args, env = process.env) {
  const begin = Date.now();
  rawLog += `\n$ ${label}\n`;
  try {
    const result = await execute(binary, args, { cwd: root, env, maxBuffer: 8 * 1024 * 1024 });
    rawLog += `${result.stdout}${result.stderr}`;
    report.commands.push({ command: label, exitCode: 0, durationMs: Date.now() - begin });
    return result.stdout;
  } catch (error) {
    rawLog += `${error.stdout ?? ""}${error.stderr ?? ""}`;
    report.commands.push({ command: label, exitCode: error.code ?? 1, durationMs: Date.now() - begin });
    throw new Error(`${label} failed; inspect migration-verification.log.`, { cause: error });
  }
}

async function source(path) {
  const result = await execute("git", ["show", `${BASE}:${path}`], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
  return result.stdout;
}

async function stateDigest() {
  const tables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const hashes = {};
  for (const { tablename } of tables) {
    const result = await client.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text as value from public.${identifier(tablename)} t`);
    hashes[tablename] = sha256(result.rows[0].value);
  }
  const history = (await client.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at,id")).rows;
  return { tables: hashes, history, digest: sha256(JSON.stringify({ hashes, history })) };
}

async function asOwner(sql, params = [], expectedCode) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [A]);
    const result = await client.query(sql, params);
    assert.equal(expectedCode, undefined, "The authenticated write unexpectedly succeeded");
    return result;
  } catch (error) {
    if (!expectedCode || error.code !== expectedCode) throw error;
    return { denied: true, code: error.code };
  } finally {
    await client.query("rollback");
  }
}

// The fixture models two existing owners, including an owner who is also a
// member elsewhere, and an invitation-only identity that must stay personal.
const legacySeed = `
insert into auth.users(id,email) values
('${A}','legacy-a@example.test'),('${B}','legacy-b@example.test'),('${MEMBER}','legacy-member@example.test');
insert into public.users(id,email,onboarding_completed,booking_handle,anthropic_api_key_encrypted) values
('${A}','legacy-a@example.test',true,'legacy-a-handle','encrypted-fixture-a'),
('${B}','legacy-b@example.test',true,'legacy-b-handle',null),
('${MEMBER}','legacy-member@example.test',false,null,null);
insert into business_profile(user_id,identity,acquisition,sales,delivery) values
('${A}','{"businessName":"Legacy A"}','{}','{}','{}'),('${B}','{"businessName":"Legacy B"}','{}','{}','{}');
insert into subscription_plans(id,key,name,price_monthly_cents,features) values
('${PLAN}','integration-legacy-team','Legacy team',19900,'{"teamMembersEnabled":true}');
insert into subscriptions(user_id,plan_id,stripe_customer_id,stripe_subscription_id,status,current_period_end) values
('${A}','${PLAN}','cus_legacy_a','sub_legacy_a','active',now()+interval '30 days'),
('${B}','${PLAN}','cus_legacy_b','sub_legacy_b','active',now()+interval '30 days');
insert into team_members(account_id,member_user_id,email,status,invited_by_user_id) values
('${B}','${A}','legacy-a@example.test','active','${B}'),
('${A}','${MEMBER}','legacy-member@example.test','active','${A}');
insert into sales(user_id,client_name,total_price,payment_type,sale_date) values
('${A}','Legacy client A',500000,'one_shot',current_date),('${B}','Legacy client B',250000,'one_shot',current_date);
`;

try {
  await mkdir(output, { recursive: true });
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--admin-url"), "Usage: node scripts/verify-business-migration.mjs [--admin-url <local postgres URL>]");
  const adminUrl = new URL(args[1] ?? `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres?sslmode=disable`);
  assert.ok(["postgres:", "postgresql:"].includes(adminUrl.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(adminUrl.hostname), "Only a loopback PostgreSQL server is allowed");
  assert.equal(decodeURIComponent(adminUrl.pathname), "/postgres", "The administrative connection must target the local postgres maintenance database");
  adminUrl.searchParams.set("sslmode", "disable");
  const databaseName = `minaly_multibusiness_migration_${started.toISOString().slice(0, 10).replaceAll("-", "")}_${randomUUID().slice(0, 8)}`;
  assert.match(databaseName, /^minaly_multibusiness_[a-zA-Z0-9_]+$/);
  assert.ok(databaseName.length <= 63);
  admin = new pg.Client({ connectionString: adminUrl.toString(), ssl: false });
  await admin.connect();
  const server = (await admin.query("select host(inet_server_addr()) as address,current_database() as database")).rows[0];
  check("administrative connection is loopback", ["127.0.0.1", "::1"].includes(server.address) && server.database === "postgres");
  assert.equal((await admin.query("select 1 from pg_database where datname=$1", [databaseName])).rowCount, 0, "Refusing to reuse an existing database");
  await admin.query(`create database ${identifier(databaseName)}`);
  report.database = { name: databaseName, host: adminUrl.hostname, retainedForReview: true };
  const target = new URL(adminUrl);
  target.pathname = `/${databaseName}`;
  client = new pg.Client({ connectionString: target.toString(), ssl: false });
  await client.connect();
  check("target is a newly created disposable database", (await client.query("select current_database() as name")).rows[0].name === databaseName);

  const schemaSource = await source("db/schema.ts");
  const temporary = await mkdtemp(join(tmpdir(), "minaly-migration-baseline-"));
  temporarySchema = join(root, "db", `.migration-baseline-${randomUUID()}.ts`);
  await writeFile(temporarySchema, schemaSource);
  const baselineDirectory = join(temporary, "baseline");
  await command("generate full baseline from the pre-change schema", process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate", "--dialect", "postgresql", "--schema", temporarySchema, "--out", baselineDirectory, "--name", "baseline"]);
  const baseline = await readFile(join(baselineDirectory, "0000_baseline.sql"), "utf8");
  report.baseline = { schemaSha256: sha256(schemaSource), sqlSha256: sha256(baseline), tableCount: (baseline.match(/CREATE TABLE /g) ?? []).length, generationDirectory: temporary };
  check("baseline is the full pre-change schema", report.baseline.tableCount >= 120 && !baseline.includes('CREATE TABLE "businesses"'));
  await client.query(await readFile(join(root, "scripts/multi-business-test-bootstrap.sql"), "utf8"));
  await client.query(baseline);
  await client.query(legacySeed);

  const oldJournal = JSON.parse(await source("db/migrations/meta/_journal.json"));
  check("baseline journal ends at migration 71", oldJournal.entries.length === 72 && oldJournal.entries.at(-1).idx === 71);
  await client.query("create schema drizzle; create table drizzle.__drizzle_migrations(id serial primary key,hash text not null,created_at bigint)");
  const oldHistory = [];
  for (const entry of oldJournal.entries) {
    const sql = await source(`db/migrations/${entry.tag}.sql`);
    const hash = sha256(sql);
    await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [hash, entry.when]);
    oldHistory.push({ tag: entry.tag, hash, createdAt: entry.when });
  }
  report.preUpgradeHistory = { rows: oldHistory.length, digest: sha256(JSON.stringify(oldHistory)), latest: oldHistory.at(-1) };
  const migrationEnv = { ...process.env, DIRECT_URL: target.toString(), DATABASE_URL: target.toString(), ADMIN_EMAILS: "browser-admin@example.test" };
  await command("npm run db:migrate (first official run)", "npm", ["run", "db:migrate"], migrationEnv);

  const journal = JSON.parse(await readFile(join(root, "db/migrations/meta/_journal.json"), "utf8"));
  const upgraded = journal.entries.filter((entry) => entry.idx > 71);
  check("official runner applied migrations 72 and 73", upgraded.length === 2 && upgraded[0].idx === 72 && upgraded[1].idx === 73);
  const applied = (await client.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at,id")).rows;
  check("history contains exactly one row per journal entry", applied.length === journal.entries.length && new Set(applied.map((row) => row.created_at)).size === applied.length, { rows: applied.length });
  for (const entry of upgraded) {
    const expected = sha256(await readFile(join(root, `db/migrations/${entry.tag}.sql`), "utf8"));
    check(`${entry.tag} hash and timestamp match its source`, applied.some((row) => row.hash === expected && Number(row.created_at) === entry.when));
  }
  check("all pre-change history hashes and timestamps are retained", oldHistory.every((entry) => applied.some((row) => row.hash === entry.hash && Number(row.created_at) === entry.createdAt)));

  const businessRows = (await client.query("select id,owner_user_id,name,booking_handle,stripe_customer_id from businesses order by id")).rows;
  check("exactly the two legacy businesses are preserved", businessRows.length === 2 && businessRows[0].id === A && businessRows[1].id === B, { names: businessRows.map((row) => row.name) });
  check("legacy business ownership is preserved", businessRows.every((row) => row.id === row.owner_user_id));
  check("invitation-only identity is not materialized as a business", !businessRows.some((row) => row.id === MEMBER) && (await client.query("select id from users where id=$1", [MEMBER])).rowCount === 1);
  check("owner membership in another business is retained", (await client.query("select id from team_members where account_id=$1 and member_user_id=$2 and status='active'", [B, A])).rowCount === 1);
  check("booking handles are preserved", businessRows[0].booking_handle === "legacy-a-handle" && businessRows[1].booking_handle === "legacy-b-handle");
  check("subscription customer backfill is preserved", businessRows[0].stripe_customer_id === "cus_legacy_a" && businessRows[1].stripe_customer_id === "cus_legacy_b");
  const sales = (await client.query("select user_id,total_price from sales order by user_id")).rows;
  check("legacy sales amounts remain attached to their businesses", sales.length === 2 && sales[0].user_id === A && sales[0].total_price === 500000 && sales[1].user_id === B && sales[1].total_price === 250000);
  const subscriptions = (await client.query("select user_id,stripe_subscription_id,status from subscriptions order by user_id")).rows;
  check("legacy Stripe subscription identities are retained", subscriptions.length === 2 && subscriptions[0].stripe_subscription_id === "sub_legacy_a" && subscriptions[1].stripe_subscription_id === "sub_legacy_b" && subscriptions.every((row) => row.status === "active"));
  check("platform admin roster was synchronized by the official script", (await client.query("select email from platform_admin_emails")).rows.every((row) => row.email === "browser-admin@example.test") && (await client.query("select count(*)::int as count from platform_admin_emails")).rows[0].count === 1);

  const newTables = ["businesses", "agent_token_usage", "platform_admin_emails"];
  const rls = (await client.query("select relname,relrowsecurity from pg_class where oid=any($1::regclass[])", [newTables])).rows;
  check("all three new tables have RLS enabled", rls.length === newTables.length && rls.every((row) => row.relrowsecurity), { tables: rls.map((row) => row.relname) });
  const foreignKeys = (await client.query(`select c.conname,src.relname as source,dst.relname as target,c.convalidated,
    array(select attname::text from unnest(c.conkey) with ordinality k(n,pos) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n order by k.pos) as source_columns,
    array(select attname::text from unnest(c.confkey) with ordinality k(n,pos) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n order by k.pos) as target_columns
    from pg_constraint c join pg_class src on src.oid=c.conrelid join pg_class dst on dst.oid=c.confrelid
    join pg_namespace ns on ns.oid=src.relnamespace join pg_namespace nd on nd.oid=dst.relnamespace
    where c.contype='f' and ns.nspname='public' and nd.nspname='public' order by src.relname,c.conname`)).rows;
  const scopes = new Map();
  for (const fk of foreignKeys.filter((row) => row.target === "businesses")) {
    const values = scopes.get(fk.source) ?? [];
    scopes.set(fk.source, [...new Set([...values, ...fk.source_columns])]);
  }
  let scopeChecks = 0;
  for (const fk of foreignKeys) {
    check(`validated foreign key ${fk.source}.${fk.conname}`, fk.convalidated);
    const join = fk.source_columns.map((column, i) => `s.${identifier(column)}=d.${identifier(fk.target_columns[i])}`).join(" and ");
    const present = fk.source_columns.map((column) => `s.${identifier(column)} is not null`).join(" and ");
    const count = (await client.query(`select count(*)::int as count from public.${identifier(fk.source)} s left join public.${identifier(fk.target)} d on ${join} where ${present} and d.${identifier(fk.target_columns[0])} is null`)).rows[0].count;
    assert.equal(count, 0, `Orphaned ${fk.source}.${fk.conname}`);
    const sourceScope = scopes.get(fk.source);
    const targetScope = scopes.get(fk.target);
    if (sourceScope?.length === 1 && targetScope?.length === 1) {
      const mismatch = (await client.query(`select count(*)::int as count from public.${identifier(fk.source)} s join public.${identifier(fk.target)} d on ${join} where s.${identifier(sourceScope[0])} is distinct from d.${identifier(targetScope[0])}`)).rows[0].count;
      assert.equal(mismatch, 0, `Foreign business scope in ${fk.source}.${fk.conname}`);
      scopeChecks++;
    }
  }
  for (const [table, columns] of scopes) {
    if (columns.length > 1 && !["referral_attributions", "referral_commissions"].includes(table)) {
      const mismatch = columns.slice(1).map((column) => `${identifier(column)} is distinct from ${identifier(columns[0])}`).join(" or ");
      assert.equal((await client.query(`select count(*)::int as count from public.${identifier(table)} where ${mismatch}`)).rows[0].count, 0, `Conflicting scope columns in ${table}`);
      scopeChecks++;
    }
  }
  check("no orphaned foreign keys or foreign business scope references", true, { foreignKeys: foreignKeys.length, businessScopeRelationships: scopeChecks });
  check("authenticated owner can read existing billing for recovery", (await asOwner("select status from subscriptions where user_id=$1", [A])).rows.length === 1);
  check("authenticated owner can update its operational business profile", (await asOwner("update business_profile set identity=identity || '{\"niche\":\"positive fixture write\"}'::jsonb where user_id=$1 returning user_id", [A])).rowCount === 1);
  for (const [name, sql, params] of [
    ["subscription state", "update subscriptions set status='canceled' where user_id=$1", [A]],
    ["subscription deletion", "delete from subscriptions where user_id=$1", [A]],
    ["referral rates", "update referral_codes set commission_rate_bps=10000 where account_id=$1", [A]],
    ["referral payouts", "insert into referral_payouts(referrer_account_id,currency,amount_cents) values($1,'eur',1000000)", [A]],
    ["shared usage quota", "delete from shared_agent_usage where user_id=$1", [A]],
    ["token usage accounting", "insert into agent_token_usage(business_id,actor_user_id,key_source,operation,input_tokens,output_tokens) values($1,$2,'shared','forgery',1,1)", [A, A]],
  ]) {
    check(`authenticated client cannot forge ${name}`, (await asOwner(sql, params, "42501")).denied === true);
  }

  await client.query("begin");
  try {
    const code = randomUUID();
    const attribution = randomUUID();
    await client.query("insert into referral_codes(id,account_id,code,commission_rate_bps) values($1,$2,$3,1000)", [code, A, `fixture-${code}`]);
    await client.query("insert into referral_attributions(id,referral_code_id,referrer_account_id,referred_account_id) values($1,$2,$3,$4)", [attribution, code, A, B]);
    await client.query("insert into referral_commissions(attribution_id,referrer_account_id,referred_account_id,stripe_invoice_id,stripe_subscription_id,currency,gross_amount_cents,eligible_amount_cents,commission_rate_bps,commission_amount_cents) values($1,$2,$3,'in_migration_fixture','sub_legacy_b','eur',10000,10000,1000,1000)", [attribution, A, B]);
    check("legitimate cross-business referral and commission are accepted", (await client.query("select id from referral_commissions where attribution_id=$1", [attribution])).rowCount === 1);
  } finally {
    await client.query("rollback");
  }
  await client.query("begin");
  try {
    const second = randomUUID();
    await client.query("insert into businesses(id,owner_user_id,name,anthropic_api_key_encrypted) values($1,$2,'Second fixture business','second-fixture-key')", [second, A]);
    await client.query("update users set anthropic_api_key_encrypted='legacy-writer-fixture' where id=$1", [A]);
    check("old writer bridge updates only the unambiguous initial business", (await client.query("select anthropic_api_key_encrypted='legacy-writer-fixture' as correct from businesses where id=$1", [A])).rows[0].correct && (await client.query("select anthropic_api_key_encrypted='second-fixture-key' as untouched from businesses where id=$1", [second])).rows[0].untouched);
    await client.query("update businesses set anthropic_api_key_encrypted='new-initial-writer-fixture' where id=$1", [A]);
    check("initial business configuration synchronizes back to legacy writers", (await client.query("select anthropic_api_key_encrypted='new-initial-writer-fixture' as correct from users where id=$1", [A])).rows[0].correct);
    await client.query("update businesses set anthropic_api_key_encrypted='new-second-writer-fixture' where id=$1", [second]);
    check("second business configuration does not alter the initial business or personal mirror", (await client.query("select u.anthropic_api_key_encrypted=b.anthropic_api_key_encrypted and u.anthropic_api_key_encrypted='new-initial-writer-fixture' as correct from users u join businesses b on b.id=u.id where u.id=$1", [A])).rows[0].correct);
  } finally {
    await client.query("rollback");
  }

  const beforeSecond = await stateDigest();
  await command("npm run db:migrate (second official run)", "npm", ["run", "db:migrate"], migrationEnv);
  const afterSecond = await stateDigest();
  check("second official run leaves every public table and migration row unchanged", beforeSecond.digest === afterSecond.digest, { tables: Object.keys(beforeSecond.tables).length, digest: afterSecond.digest });
  report.status = "passed";
  report.completedAt = new Date().toISOString();
  report.durationMs = Date.now() - started.getTime();
  console.log(`Verified database retained: ${databaseName}`);
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  report.completedAt = new Date().toISOString();
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await client?.end();
  await admin?.end();
  if (temporarySchema) await rm(temporarySchema, { force: true });
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "migration-verification.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(output, "migration-verification.log"), rawLog.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[local database URL]"));
  const lines = ["# Official migration-runner verification", "", `Result: **${report.status}**.`, "", `Started: ${report.startedAt}.`, `Pre-change schema: \`${BASE}\`.`, `Disposable database retained: \`${report.database?.name ?? "not created"}\` on loopback only.`, "", "Run again with `npm run test:business-migration`. Each run creates a new database; it never drops or reuses an existing one. The local PostgreSQL role must be able to create databases. An optional `--admin-url` must target the loopback postgres maintenance database.", "", "The script generates a full baseline from the Git revision, initializes the local auth bootstrap, seeds legacy data and records the 72 original migration hashes/timestamps. It then runs the real `npm run db:migrate` command twice, including the platform-admin synchronization script. It does not contact Supabase, Stripe or other vendors.", "", "Assertions:", "", ...report.assertions.filter((item) => !item.name.startsWith("validated foreign key")).map((item) => `- ${item.passed ? "PASS" : "FAIL"}: ${item.name}.`), "", "Detailed counts, source hashes and timestamps are in migration-verification.json. Raw local command output is in migration-verification.log. This reconstructs the schema at migration 71; it does not claim that the existing migration history can initialize an empty installation without the generated baseline."];
  lines.push("", "The repeated-run comparison checks logical row contents. The platform-admin synchronization intentionally replaces its roster rows on every run with the same configured values.");
  if (report.error) lines.push("", `Failure: ${report.error}`);
  await writeFile(join(output, "migration-verification.md"), `${lines.join("\n")}\n`);
}
