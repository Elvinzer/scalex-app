"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { linkLeadToSale } from "@/lib/leads/queries";
import { createSale } from "@/lib/sales/queries";
import { saleInputSchema } from "@/lib/sales/schema";
import { requirePermission } from "@/lib/team/context";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Thin wrapper around the exact same validation/creation path as
// /ventes/suivi (saleInputSchema + createSale) — no new sale logic, just
// the extra "link the lead back to the new sale" step at the end. The
// Kanban's drag-to-"Closé" handler opens this, never calls changeStageAction
// directly for that column.
export async function validateSaleFromLead(leadId: string, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = saleInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  const sale = await createSale(accountId, { ...parsed.data, leadId });
  await linkLeadToSale(accountId, leadId, sale.id);

  after(() =>
    track("sale_validated", userId, {
      setter_id: parsed.data.setterId,
      closer: parsed.data.closer,
      offer_id: parsed.data.offerId,
    })
  );

  revalidatePath("/ventes/suivi");
  revalidatePath("/ventes/pipeline");
  revalidatePath("/ventes/setters");
  revalidatePath("/diagnostic-app");
  revalidateBusinessData();
  return { error: null };
}
