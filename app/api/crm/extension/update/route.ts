import { NextResponse, type NextRequest } from "next/server";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { readCrmExtensionBody } from "@/lib/crm/extension-http";
import { getCrmExtensionAccess } from "@/lib/crm/extension-session";
import { addCrmNote, changeCrmStage, createCrmAction, updateCrmLeadFields } from "@/lib/crm/queries";
import { crmExtensionUpdateSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await getCrmExtensionAccess(request);
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isRateLimited(`crm-extension-update:${access.userId}:${getClientIp(request)}`, 30, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const bodyResult = await readCrmExtensionBody(request);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.reason === "too_large" ? "payload_too_large" : "invalid_request" }, { status: bodyResult.reason === "too_large" ? 413 : 400 });
  const body = bodyResult.body;
  const parsed = crmExtensionUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_update" }, { status: 400 });
  const { leadId, idempotencyKey } = parsed.data;
  if (parsed.data.displayName !== undefined || parsed.data.firstName !== undefined || parsed.data.lastName !== undefined || parsed.data.offerId !== undefined) {
    const lead = await updateCrmLeadFields(access.accountId, leadId, { displayName: parsed.data.displayName, firstName: parsed.data.firstName, lastName: parsed.data.lastName, offerId: parsed.data.offerId }, access.userId, "extension", idempotencyKey);
    if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }
  if (parsed.data.stage) {
    const lead = await changeCrmStage(access.accountId, leadId, parsed.data.stage, access.userId, "extension", idempotencyKey);
    if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }
  if (parsed.data.note) {
    const note = await addCrmNote(access.accountId, leadId, access.userId, parsed.data.note, "extension", idempotencyKey);
    if (!note) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }
  if (parsed.data.action) {
    const action = await createCrmAction(access.accountId, access.userId, { leadId, ...parsed.data.action, dueAt: new Date(parsed.data.action.dueAt), source: "extension", idempotencyKey: `extension:${idempotencyKey}` });
    if (!action) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }
  return NextResponse.json({ data: { updated: true }, updated: true });
}
