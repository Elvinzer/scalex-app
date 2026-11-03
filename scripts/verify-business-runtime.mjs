import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";

const databaseValue = process.env.MULTI_BUSINESS_TEST_DATABASE_URL;
if (!databaseValue) throw new Error("A disposable MULTI_BUSINESS_TEST_DATABASE_URL is required.");
const databaseUrl = new URL(databaseValue);
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)
  || !/^minaly_multibusiness_[a-zA-Z0-9_]+$/.test(databaseUrl.pathname.slice(1))) {
  throw new Error("Refusing runtime verification outside a disposable loopback database.");
}
databaseUrl.searchParams.set("sslmode", "disable");
const origin = new URL(process.argv[2] ?? "http://localhost:3000");
if (origin.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
  throw new Error("Runtime verification requires a local development app.");
}
const own = "c3333333-3333-4333-8333-333333333333";
const foreign = "a1111111-1111-4111-8111-111111111111";
const client = new pg.Client({ connectionString: databaseUrl.toString(), ssl: false });
await client.connect();
const target = await client.query("select current_database() as name,host(inet_server_addr()) as host");
assert.match(target.rows[0].name, /^minaly_multibusiness_/);
assert.ok(["127.0.0.1", "::1"].includes(target.rows[0].host));
const checks = [];
const headers = { "content-type": "application/json", origin: origin.origin, referer: `${origin.origin}/b/${own}/crm` };
let original;
try {
  const business = await client.query("select u.email from businesses b join users u on u.id=b.owner_user_id where b.id=$1", [own]);
  assert.equal(business.rows[0]?.email, "browser-owner@example.test", "Seed the documented synthetic browser fixtures first.");
  const response = await fetch(new URL("/api/crm/extension/session", origin), { method: "POST", headers, body: JSON.stringify({ businessId: own }) });
  const session = await response.json();
  assert.equal(response.status, 200);
  assert.equal(session.businessId, own);
  assert.equal(typeof session.token, "string");
  checks.push("active owner receives a session pinned to the selected business");

  const denied = await fetch(new URL("/api/crm/extension/session", origin), { method: "POST", headers, body: JSON.stringify({ businessId: foreign }) });
  assert.equal(denied.status, 403);
  checks.push("another owner's business is denied");
  const forged = await fetch(new URL("/api/crm/extension/session", origin), { method: "POST", headers: { "content-type": "application/json", origin: origin.origin, "x-minaly-business-id": own }, body: "{}" });
  assert.equal(forged.status, 403);
  checks.push("a forged browser business header is discarded");
  const conflict = await fetch(new URL(`/b/${own}/api/billing/portal?business=${foreign}`, origin), { redirect: "manual" });
  assert.equal(conflict.status, 400);
  checks.push("conflicting explicit billing targets are denied");
  const callback = await fetch(new URL("/api/stripe/callback?state=invalid&code=local-fake", origin), { redirect: "manual" });
  assert.ok([302, 303, 307].includes(callback.status));
  assert.ok((callback.headers.get("location") ?? "").startsWith(origin.origin));
  checks.push("invalid OAuth state returns locally before contacting a provider");

  async function resolve() {
    return fetch(new URL("/api/crm/extension/resolve", origin), { method: "POST", headers: {
      ...headers, referer: `${origin.origin}/b/${foreign}/crm`, authorization: `Bearer ${session.token}`,
    }, body: JSON.stringify({ platform: "instagram", handle: "minaly_isolated_runtime_fixture", profileUrl: "https://www.instagram.com/minaly_isolated_runtime_fixture/" }) });
  }
  const pinned = await resolve();
  assert.equal(pinned.status, 200);
  assert.equal((await pinned.json()).accountId, own);
  checks.push("signed extension requests retain their business despite a different referring tab");
  original = (await client.query("select status,payment_blocked_at,current_period_end from subscriptions where user_id=$1", [own])).rows[0];
  assert.ok(original);
  await client.query("update subscriptions set status='past_due',payment_blocked_at=now() where user_id=$1", [own]);
  assert.equal((await resolve()).status, 401);
  const suspended = await fetch(new URL("/api/crm/extension/session", origin), { method: "POST", headers, body: JSON.stringify({ businessId: own }) });
  assert.equal(suspended.status, 403);
  checks.push("suspension rejects both an existing signed token and its renewal");
  await client.query("update subscriptions set status=$2,payment_blocked_at=$3,current_period_end=$4 where user_id=$1", [own, original.status, original.payment_blocked_at, original.current_period_end]);
  original = null;
  assert.equal((await resolve()).status, 200);
  checks.push("verified restored entitlement permits the existing pinned session again");

  for (const name of ["get_compilation_issues", "get_errors"]) {
    const response = await fetch(new URL("/_next/mcp", origin), { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }) });
    const line = (await response.text()).split("\n").find((value) => value.startsWith("data: "));
    assert.ok(line);
    const result = JSON.parse(line.slice(6));
    const text = result.result?.content?.find((item) => item.type === "text")?.text;
    assert.equal(typeof text, "string");
    const payload = JSON.parse(text);
    if (name === "get_compilation_issues") assert.deepEqual(payload.issues, []);
    else { assert.deepEqual(payload.configErrors, []); assert.deepEqual(payload.sessionErrors, []); }
    checks.push(`${name} reports no errors`);
  }
  const report = { date: new Date().toISOString(), result: "passed", localSyntheticFixturesOnly: true, tokenLogged: false, checks };
  await mkdir("docs/reviews/multi-business/evidence", { recursive: true });
  await writeFile("docs/reviews/multi-business/evidence/runtime-api-verification.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${checks.length} runtime API and Next.js checks passed. No tokens logged.`);
} finally {
  if (original) await client.query("update subscriptions set status=$2,payment_blocked_at=$3,current_period_end=$4 where user_id=$1", [own, original.status, original.payment_blocked_at, original.current_period_end]);
  await client.end();
}
