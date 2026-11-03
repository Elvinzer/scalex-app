import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { businesses, users } from "@/db/schema";

export type IntegrationDatabase = typeof import("@/db")["db"];

export function integrationDatabaseUrl(): string | null {
  const value = process.env.MULTI_BUSINESS_TEST_DATABASE_URL;
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The multi-business integration database URL is invalid.");
  }
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^minaly_multibusiness_[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error("Multi-business integration tests require a loopback database named minaly_multibusiness_*.");
  }
  url.searchParams.set("sslmode", "disable");
  return url.toString();
}

export async function configureIntegrationDatabase(): Promise<IntegrationDatabase> {
  const target = integrationDatabaseUrl();
  if (!target) throw new Error("Set MULTI_BUSINESS_TEST_DATABASE_URL to run database integration tests.");
  process.env.DATABASE_URL = target;
  process.env.DB_POOL_MAX = "6";
  const { db } = await import("@/db");
  const result = await db.execute(sql`select current_database() as database, host(inet_server_addr()) as server_address`);
  const row = z.object({ database: z.string(), server_address: z.string() }).parse(result.rows[0]);
  if (!/^minaly_multibusiness_[a-zA-Z0-9_]+$/.test(row.database) || !["127.0.0.1", "::1"].includes(row.server_address)) {
    throw new Error("The active connection is not a disposable multi-business test database.");
  }
  return db;
}

export async function seedIdentity(database: IntegrationDatabase, input: { id?: string; email: string }): Promise<string> {
  const id = input.id ?? randomUUID();
  await database.execute(sql`insert into auth.users(id) values (${id}::uuid) on conflict (id) do nothing`);
  await database.insert(users).values({ id, email: input.email });
  return id;
}

export async function cleanupIdentityFixtures(database: IntegrationDatabase, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await database.delete(businesses).where(inArray(businesses.ownerUserId, userIds));
  await database.delete(users).where(inArray(users.id, userIds));
  await database.execute(sql`delete from auth.users where id in (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
}

export async function identityStillExists(database: IntegrationDatabase, userId: string): Promise<boolean> {
  const [row] = await database.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row);
}
