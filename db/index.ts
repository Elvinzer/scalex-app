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
// Turbopack re-evaluates modules during HMR. Reuse the client so each edit
// does not leave another pool connected to the shared database.
const globalForDb = globalThis as typeof globalThis & { minalyPostgres?: ReturnType<typeof postgres> };
const client = globalForDb.minalyPostgres ?? postgres(poolConnection.toString(), {
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
    // Direct/session connections can honor these startup parameters. The
    // transaction pooler may keep its role/database settings instead; verify
    // with current_setting rather than treating these as guaranteed limits.
    // Page deadlines bound waiting separately and retain active reads until
    // they settle. Migrations use a separate DIRECT_URL client.
    statement_timeout: 25_000,
    idle_in_transaction_session_timeout: 15_000,
  },
});

if (process.env.NODE_ENV === "development") globalForDb.minalyPostgres = client;

export const db = drizzle(client, { schema });
