import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const configuredPoolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "2", 10);
const configuredPoolMaxIsValid = Number.isInteger(configuredPoolMax) && configuredPoolMax >= 1 && configuredPoolMax <= 20;
const poolMax = configuredPoolMaxIsValid ? configuredPoolMax : 2;

// Supavisor transaction mode does not support query pipelining. postgres.js
// pipelines even with prepare:false; increasing its pool only masks the hang.
// pg queues work until ReadyForQuery and Drizzle reserves one client per
// transaction. Use the same DATABASE_URL locally so dev exercises that path.
// https://supabase.com/docs/guides/database/postgres-js
const globalForDb = globalThis as typeof globalThis & { minalyPgPool?: Pool };

function createClient() {
  const client = new Pool({
    connectionString,
    pipeline: false,
    max: poolMax,
    // Equivalent to the previous ssl:"require": always encrypt the socket.
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    maxLifetimeSeconds: 60 * 5,
    application_name: "minaly-web",
    options: "-c search_path=public,extensions",
    // Server limits supplement the client deadline; the pooler may ignore
    // startup parameters. Pool.query discards a client on a read timeout.
    statement_timeout: 25_000,
    idle_in_transaction_session_timeout: 15_000,
  });
  // pg removes failed idle connections itself. Handle the event so a stale
  // socket cannot crash the process; never log connection details or SQL.
  client.on("error", () => console.warn("[db] idle connection closed"));
  return client;
}

const client = globalForDb.minalyPgPool ?? createClient();
if (process.env.NODE_ENV === "development") globalForDb.minalyPgPool = client;

// Reuse the pool across HMR and warm invocations. Never replace the whole
// pool from a failing request, which would interrupt unrelated transactions.
export const db = drizzle(client, { schema });
