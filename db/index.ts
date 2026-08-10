import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// prepare: false — required with Supabase's Supavisor pooler in transaction
// mode, which doesn't support prepared statements. Explicitly pin the schema
// path as well: Drizzle emits public table names without a schema qualifier,
// and a reused pooler backend must resolve them consistently on every request.
const client = postgres(connectionString, {
  prepare: false,
  // Keep the serverless pool bounded for Supabase's transaction pooler. A
  // short idle timeout also discards sockets that may have gone stale while a
  // Vercel instance was asleep instead of reusing them on the next request.
  max: 5,
  idle_timeout: 60,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
  connection: {
    search_path: "public, extensions",
  },
});

export const db = drizzle(client, { schema });
