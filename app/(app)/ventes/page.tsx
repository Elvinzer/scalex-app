import { redirect } from "next/navigation";

import { PILLAR_SUBPAGES } from "@/lib/nav/pillar-subpages";
import { getAccountContext, getDefaultAppRoute } from "@/lib/team/context";
import { getCurrentUser } from "@/lib/current-user";

// Owners keep the established landing page. Delegated members land on the
// first sales page their role can actually access.
export default async function VentesIndexPage() {
  const { userId } = await getCurrentUser();
  const context = await getAccountContext(userId);

  if (!context) redirect(getDefaultAppRoute(context));
  if (context.isOwner) redirect("/ventes/suivi");

  const firstAccessibleTab = PILLAR_SUBPAGES["/ventes"].find(({ permission }) => context.permissions.has(permission));
  redirect(firstAccessibleTab?.href ?? getDefaultAppRoute(context));
}
