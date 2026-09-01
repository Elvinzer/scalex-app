"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";

import { track } from "@/lib/analytics";
import { getActiveClosers } from "@/lib/closers/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { linkLeadToSale } from "@/lib/leads/queries";
import { createSale } from "@/lib/sales/queries";
import { crmSaleValidationSchema, saleInputSchema } from "@/lib/sales/schema";
import { requirePermission } from "@/lib/team/context";
import { requireCrmPermission } from "@/lib/crm/access";
import { getCrmLead, validateCrmSale } from "@/lib/crm/queries";
import { getUserById } from "@/lib/current-user";
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
  revalidateBusinessData(access.accountId);
  return { error: null };
}

// CRM entry point for sale validation. It deliberately calls the existing
// canonical sale writer and lead-to-sale link, then records the CRM outcome;
// it never creates a CRM-specific financial row.
export async function validateSaleFromCrm(leadId: string, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmPermission(userId, "crm:validate-sale");
  const t = await getTranslations("crm");
  if (!access) return { error: t("errors.access") };
  const parsed = crmSaleValidationSchema.safeParse(data);
  if (!parsed.success || parsed.data.leadId !== leadId) return { error: t("errors.invalidSale") };
  const lead = await getCrmLead(access.accountId, leadId);
  if (!lead) return { error: t("errors.leadNotFound") };

  const actor = await getUserById(userId);
  const actorLabels = [actor?.email, actor?.displayName].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLocaleLowerCase());
  const assignedCloser = lead.closer?.trim().toLocaleLowerCase();
  const canValidateAsManager = access.isOwner || access.permissions === "all" || access.permissions.has("crm:manage-pipeline");
  if (!canValidateAsManager && (!assignedCloser || !actorLabels.includes(assignedCloser))) return { error: t("errors.salePermission") };

  const [activeClosers] = await Promise.all([getActiveClosers(access.accountId)]);
  const normalizedCloser = parsed.data.closer?.trim() || null;
  const closerIsAuthorized = normalizedCloser === null || activeClosers.some((closer) => [closer.name, closer.email].some((label) => label.trim().toLocaleLowerCase() === normalizedCloser.toLocaleLowerCase()));
  if (!closerIsAuthorized) return { error: t("errors.invalidSale") };

  let result: { saleId: string; alreadyValidated: boolean } | null;
  try {
    result = await validateCrmSale(access.accountId, leadId, { ...parsed.data, closer: normalizedCloser }, userId);
  } catch (error) {
    if (error instanceof Error && error.message === "CRM_SALE_ALREADY_VALIDATED") return { error: t("errors.saleAlreadyValidated") };
    return { error: t("errors.invalidSale") };
  }
  if (!result) return { error: t("errors.leadNotFound") };

  after(() => track("sale_validated", userId, { setter_id: parsed.data.setterId, closer: normalizedCloser, offer_id: parsed.data.offerId }));
  revalidatePath("/crm", "layout");
  revalidatePath("/crm");
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/ventes/suivi");
  revalidateBusinessData(access.accountId);
  return { error: null };
}
