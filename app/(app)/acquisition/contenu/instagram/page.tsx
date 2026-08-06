import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

export default async function ContenuInstagramPage() {
  const { userId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  redirect("/acquisition/contenu?platform=instagram");
}
