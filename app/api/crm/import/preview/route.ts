import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { getCrmImportPreview, CrmImportValidationError } from "@/lib/crm/import-service";
import { crmImportReviewSchema } from "@/lib/crm/import-schema";
import { requireCrmAccess } from "@/lib/crm/access";
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
  if (isRateLimited("crm-import-preview:" + userId, 30)) return NextResponse.json({ error: t("errors.importRateLimit") }, { status: 429 });
  const access = await requireCrmAccess(userId, "crm:manage-pipeline");
  if (!access) return NextResponse.json({ error: t("errors.access") }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.importInvalid") }, { status: 400 });
  }
  const parsed = crmImportReviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: t("errors.importInvalid") }, { status: 422 });

  try {
    const preview = await getCrmImportPreview(access.accountId, parsed.data, await getRequestLocale());
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof CrmImportValidationError) {
      const message = error.code === "INVALID_IMPORT" ? t("errors.importInvalid") : t("errors.importReviewRequired");
      return NextResponse.json({ error: message }, { status: error.code === "INVALID_IMPORT" ? 422 : 409 });
    }
    console.error("CRM import preview failed", error instanceof Error ? error.name : "unknown_error");
    return NextResponse.json({ error: t("errors.importPreviewFailed") }, { status: 500 });
  }
}
