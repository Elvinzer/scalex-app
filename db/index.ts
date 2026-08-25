import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const poolConnection = new URL(connectionString);
if (process.env.NODE_ENV === "development" && poolConnection.port === "6543") {
  // The transaction pooler can retain an abandoned client query while the
  // long-lived Next dev process keeps navigating. Session mode is stable for
  // local development; Vercel keeps the transaction-pooler URL from env.
  poolConnection.port = "5432";
}

const configuredPoolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "5", 10);
const poolMax = Number.isInteger(configuredPoolMax) && configuredPoolMax >= 1 && configuredPoolMax <= 20 ? configuredPoolMax : 5;

// prepare: false — required with Supabase's Supavisor pooler in transaction
// mode, which doesn't support prepared statements. Explicitly pin the schema
// path as well: Drizzle emits public table names without a schema qualifier,
// and a reused pooler backend must resolve them consistently on every request.
const client = postgres(poolConnection.toString(), {
  prepare: false,
  // Keep a small client-side pool for Supabase's pooler. App Router pages
  // already batch independent reads with Promise.all; this avoids multiplying
  // those batches across too many pooler sessions.
  max: poolMax,
  idle_timeout: 30,
  connect_timeout: 10,
  keep_alive: 30,
  max_lifetime: 60 * 5,
  connection: {
    search_path: "public, extensions",
    // Hard ceiling on any single query, set as a Postgres GUC on the session.
    // Without it a query that blocks (lock contention, an exhausted pooler)
    // runs until Vercel kills the whole function at 300s, and every request
    // queued behind that connection times out with it — the "prod bloquée,
    // ultra random" cascade. Killed queries free their connection instead.
    // Migrations use a separate DIRECT_URL client (drizzle.config.ts), so this
    // never truncates a long migration.
    statement_timeout: 25_000,
    idle_in_transaction_session_timeout: 15_000,
  },
});

export const db = drizzle(client, { schema });
