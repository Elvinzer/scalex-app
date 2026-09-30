import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";

import { requireCrmAccess } from "@/lib/crm/access";
import { CrmImportValidationError, commitCrmImport } from "@/lib/crm/import-service";
import { crmImportCommitPayloadSchema } from "@/lib/crm/import-schema";
import { getRequestLocale } from "@/lib/i18n/locale";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const t = await getTranslations("crm");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: t("errors.session") }, { status: 401 });
  const userId = data.claims.sub;
  if (typeof userId !== "string" || !userId) return NextResponse.json({ error: t("errors.invalidSession") }, { status: 401 });
  if (isRateLimited("crm-import-commit:" + userId, 10)) {
    return NextResponse.json({ error: t("errors.importRateLimit") }, { status: 429 });
  }
  const access = await requireCrmAccess(userId, "crm:manage-pipeline");
  if (!access) return NextResponse.json({ error: t("errors.importWriteAccess") }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.importInvalid") }, { status: 400 });
  }
  const parsed = crmImportCommitPayloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: t("errors.importInvalid") }, { status: 422 });

  try {
    const result = await commitCrmImport(access.accountId, userId, parsed.data, await getRequestLocale());
    revalidatePath("/crm");
    revalidatePath("/crm/leads");
    revalidatePath("/crm/pipeline");
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmImportValidationError) {
      const message = error.code === "IDEMPOTENCY_CONFLICT"
        ? t("errors.importConflict")
        : error.code === "REVIEW_REQUIRED"
          ? t("errors.importReviewRequired")
          : t("errors.importInvalid");
      return NextResponse.json({ error: message }, { status: error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 422 });
    }
    console.error("CRM import commit failed", error instanceof Error ? error.name : "unknown_error");
    return NextResponse.json({ error: t("errors.importCommitFailed") }, { status: 500 });
  }
}
