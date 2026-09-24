import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { NextResponse, type NextRequest } from "next/server";

import { requireUserIdOrError } from "@/lib/current-user";
import { requireCrmAccess } from "@/lib/crm/access";
import { normalizeCapturedProfile } from "@/lib/crm/normalization";
import { createCrmLead, resolveCrmProfile } from "@/lib/crm/queries";
import { crmLeadCaptureSchema } from "@/lib/crm/schemas";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

type CaptureErrorKey = "access" | "invalidProfile" | "ambiguousMatch" | "captureFailed";

async function crmError(key: CaptureErrorKey = "access"): Promise<string> {
  const t = await getTranslations("crm");
  return t(`errors.${key}`);
}

function revalidateCrm(): void {
  revalidatePath("/crm", "layout");
  revalidatePath("/crm");
  revalidatePath("/crm/pipeline");
  revalidatePath("/crm/leads");
}

export async function POST(request: NextRequest) {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return NextResponse.json({ state: "error", error: userId.error }, { status: 401 });

  if (isRateLimited(`crm-lead-capture:${userId}:${getClientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ state: "error", error: await crmError("captureFailed") }, { status: 429 });
  }

  const access = await requireCrmAccess(userId);
  if (!access) return NextResponse.json({ state: "error", error: await crmError() }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ state: "error", error: await crmError("invalidProfile") }, { status: 400 });
  }

  const parsedInput = crmLeadCaptureSchema.safeParse(body);
  if (!parsedInput.success) return NextResponse.json({ state: "error", error: await crmError("invalidProfile") }, { status: 400 });

  const profile = normalizeCapturedProfile(parsedInput.data);
  if (!profile) return NextResponse.json({ state: "error", error: await crmError("invalidProfile") }, { status: 400 });

  try {
    const resolution = await resolveCrmProfile(access.accountId, profile);
    if (resolution.kind === "ambiguous") {
      return NextResponse.json({ state: "error", error: await crmError("ambiguousMatch") }, { status: 409 });
    }

    const result = await createCrmLead(access.accountId, {
      profile,
      actorUserId: userId,
      offerId: parsedInput.data.offerId ?? null,
      marketingSource: parsedInput.data.source,
      stage: parsedInput.data.stage,
      responsibleSetterId: parsedInput.data.responsibleSetterId ?? null,
      email: null,
      phone: null,
      closerUserId: null,
      source: "app",
      sourceEventKey: parsedInput.data.sourceEventKey ?? null,
      idempotencyKey: parsedInput.data.idempotencyKey ?? null,
    });
    revalidateCrm();
    return NextResponse.json({ state: "saved", error: null, leadId: result.lead.id, created: result.created });
  } catch (error) {
    console.error("[crm] lead capture failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ state: "error", error: await crmError("captureFailed") }, { status: 500 });
  }
}
