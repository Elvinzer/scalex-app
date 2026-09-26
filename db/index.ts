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

const configuredPoolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "1", 10);
const configuredPoolMaxIsValid = Number.isInteger(configuredPoolMax) && configuredPoolMax >= 1 && configuredPoolMax <= 20;
// Vercel can freeze a warm function between invocations. Supabase recommends
// one application-side connection per serverless instance so a stale socket
// cannot occupy several pool slots and queue the whole render behind it.
// Local development can opt into a larger pool when parallel query debugging
// requires it; production stays capped at one connection.
const poolMax = process.env.NODE_ENV === "production" ? 1 : configuredPoolMaxIsValid ? configuredPoolMax : 1;

// prepare: false — required with Supabase's Supavisor pooler in transaction
// mode, which doesn't support prepared statements. Explicitly pin the schema
// path as well: Drizzle emits public table names without a schema qualifier,
// and a reused pooler backend must resolve them consistently on every request.
// Turbopack re-evaluates modules during HMR. Reuse the client so each edit
// does not leave another pool connected to the shared database.
const globalForDb = globalThis as typeof globalThis & { minalyPostgres?: ReturnType<typeof postgres> };

function createClient() {
  const client = postgres(poolConnection.toString(), {
    prepare: false,
    max: poolMax,
    ssl: "require",
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 5,
    connection: {
      application_name: "minaly-web",
      search_path: "public, extensions",
      // The transaction pooler does not preserve all session parameters, so
      // read retries remain the recovery path for cancelled or stale reads.
      statement_timeout: 25_000,
      idle_in_transaction_session_timeout: 15_000,
    },
  });
  if (process.env.NODE_ENV === "development") globalForDb.minalyPostgres = client;
  return client;
}

function createDatabase(client: ReturnType<typeof postgres>) {
  return { client, db: drizzle(client, { schema }) };
}

const initialClient = globalForDb.minalyPostgres ?? createClient();
let databaseState = createDatabase(initialClient);

// This live ES module binding lets a retry use a fresh Drizzle session after a
// stale socket is recycled, without changing every import site.
export let db = databaseState.db;

let resetInFlight: Promise<void> | undefined;

export function resetDatabaseClient(): Promise<void> {
  if (resetInFlight) return resetInFlight;

  const previousClient = databaseState.client;
  const nextClient = createClient();
  databaseState = createDatabase(nextClient);
  db = databaseState.db;

  resetInFlight = previousClient
    .end({ timeout: 1 })
    .catch(() => undefined)
    .finally(() => {
      resetInFlight = undefined;
    });

  return resetInFlight;
}
