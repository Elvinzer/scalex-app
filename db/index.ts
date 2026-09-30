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

const configuredPoolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "2", 10);
const configuredPoolMaxIsValid = Number.isInteger(configuredPoolMax) && configuredPoolMax >= 1 && configuredPoolMax <= 20;
// App Router pages deliberately batch independent reads with Promise.all.
// One postgres.js connection pipelines that batch through Supavisor's
// transaction pooler and can leave the whole render waiting indefinitely.
// Keep at least two connections in production so concurrent reads are split
// across pooler leases; DB_POOL_MAX can still increase the pool when needed.
const poolMax = process.env.NODE_ENV === "production"
  ? Math.max(configuredPoolMaxIsValid ? configuredPoolMax : 2, 2)
  : configuredPoolMaxIsValid
    ? configuredPoolMax
    : 1;
const DATABASE_LIVENESS_TIMEOUT_MS = 2_500;

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
    keep_alive: 30,
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

type DatabaseClient = ReturnType<typeof postgres>;

async function pingDatabase(client: DatabaseClient): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Database liveness check timed out")), DATABASE_LIVENESS_TIMEOUT_MS);
  });

  try {
    await Promise.race([client`select 1`, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let livenessCheckInFlight: Promise<void> | undefined;

/**
 * Vercel can freeze a warm function while Supavisor or the NAT drops the TCP
 * socket. A fresh liveness query detects that stale connection before the
 * request starts queueing its real reads behind it.
 */
export function ensureDatabaseConnection(): Promise<void> {
  if (livenessCheckInFlight) return livenessCheckInFlight;

  const check = (async () => {
    try {
      await pingDatabase(databaseState.client);
    } catch {
      await resetDatabaseClient();
      await pingDatabase(databaseState.client);
    }
  })();
  const trackedCheck = check.finally(() => {
    if (livenessCheckInFlight === trackedCheck) livenessCheckInFlight = undefined;
  });
  livenessCheckInFlight = trackedCheck;
  return trackedCheck;
}

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
