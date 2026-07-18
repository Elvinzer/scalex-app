"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { businessProfile } from "@/db/schema";
import { businessProfileSectionSchemas } from "@/lib/business/schema";
import { EMPTY_BUSINESS_PROFILE, type BusinessSection } from "@/lib/business/types";
import { createClient } from "@/lib/supabase/server";

export async function saveBusinessSection(
  section: BusinessSection,
  data: unknown
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = authData.claims.sub as string;

  const parsed = businessProfileSectionSchemas[section].safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Section invalide" };
  }

  await db
    .insert(businessProfile)
    .values({ userId, ...EMPTY_BUSINESS_PROFILE, [section]: parsed.data })
    .onConflictDoUpdate({
      target: businessProfile.userId,
      set: { [section]: parsed.data, updatedAt: new Date() },
    });

  revalidatePath("/business");
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic");
  revalidatePath("/agent");
  return { error: null };
}
