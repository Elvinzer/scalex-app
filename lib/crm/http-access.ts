import { createClient } from "@/lib/supabase/server";
import { requireCrmAccess, type CrmAccess } from "@/lib/crm/access";
import type { PermissionKey } from "@/lib/team/permissions";

export async function getAuthenticatedCrmApiAccess(permission: PermissionKey = "crm:view"): Promise<
  { userId: string; access: CrmAccess } | { error: "unauthorized" | "forbidden" }
> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string" || userId.length === 0) return { error: "unauthorized" };
  const access = await requireCrmAccess(userId, permission);
  return access ? { userId, access } : { error: "forbidden" };
}
