import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

export default async function ContenuYoutubePage() {
  const { userId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  redirect("/acquisition/contenu?platform=youtube");
}
