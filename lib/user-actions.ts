"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { businesses } from "@/db/schema";
import { SECTOR_KEYS } from "@/lib/benchmarks";
import { requireUserId } from "@/lib/current-user";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { requireOwner } from "@/lib/team/context";

const sectorSchema = z.enum(SECTOR_KEYS).nullable();

// Sector is an account-level setting consumed by both /setting and /closing's
// market benchmark sections, hence living here rather than under one feature.
export async function updateSector(sector: string | null): Promise<{ error: string | null }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }

  const parsed = sectorSchema.safeParse(sector);
  if (!parsed.success) {
    return { error: "Secteur invalide" };
  }

  const access = await requireOwner(userId);
  if (!access) return { error: "Action réservée au propriétaire du compte." };
  await db.update(businesses).set({ sector: parsed.data }).where(eq(businesses.id, access.accountId));

  revalidatePath("/diagnostic-app");
  revalidatePath("/ventes/pipeline");
  revalidatePath("/ventes/pipeline/funnel");
  revalidateBusinessData(access.accountId);
  return { error: null };
}
