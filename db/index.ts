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

// prepare: false — required with Supabase's Supavisor pooler in transaction
// mode, which doesn't support prepared statements. Explicitly pin the schema
// path as well: Drizzle emits public table names without a schema qualifier,
// and a reused pooler backend must resolve them consistently on every request.
const client = postgres(poolConnection.toString(), {
  prepare: false,
  // Keep a small client-side pool for Supabase's pooler. App Router pages
  // already batch independent reads with Promise.all; this avoids multiplying
  // those batches across too many pooler sessions.
  max: 3,
  idle_timeout: 30,
  connect_timeout: 10,
  keep_alive: 30,
  max_lifetime: 60 * 5,
  connection: {
    search_path: "public, extensions",
  },
});

export const db = drizzle(client, { schema });
