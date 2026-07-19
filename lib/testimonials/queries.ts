import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { testimonials } from "@/db/schema";

import type { TestimonialInput } from "./schema";
import type { TestimonialRow } from "./types";

function toRow(row: typeof testimonials.$inferSelect): TestimonialRow {
  return {
    id: row.id,
    clientName: row.clientName,
    format: row.format,
    content: row.content,
    url: row.url,
    collectedAt: row.collectedAt,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getTestimonials(userId: string): Promise<TestimonialRow[]> {
  const rows = await db
    .select()
    .from(testimonials)
    .where(eq(testimonials.userId, userId))
    .orderBy(desc(testimonials.collectedAt));

  return rows.map(toRow);
}

export async function createTestimonial(userId: string, data: TestimonialInput): Promise<void> {
  await db.insert(testimonials).values({ userId, ...data });
}

export async function updateTestimonial(userId: string, id: string, data: TestimonialInput): Promise<void> {
  await db
    .update(testimonials)
    .set(data)
    .where(and(eq(testimonials.id, id), eq(testimonials.userId, userId)));
}

export async function deleteTestimonial(userId: string, id: string): Promise<void> {
  await db.delete(testimonials).where(and(eq(testimonials.id, id), eq(testimonials.userId, userId)));
}
