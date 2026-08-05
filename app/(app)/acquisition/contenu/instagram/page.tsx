import Link from "next/link";
import { redirect } from "next/navigation";

import { getContentPosts } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getInstagramPostInsightsMap } from "@/lib/instagram/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { InstagramView } from "../instagram-view";

// Sub-page of /acquisition/contenu (the overview), same nesting pattern as
// /ventes/appels/videos. Only reachable once Instagram is connected — the
// overview renders a "non connecté" card instead of a link in that case, and
// this redirect covers a direct URL hit.
export default async function ContenuInstagramPage() {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  if (!user?.instagramConnected) redirect("/acquisition/contenu");

  const [posts, instagramInsights] = await Promise.all([getContentPosts(accountId), getInstagramPostInsightsMap(accountId)]);
  const instagramPosts = posts.filter((post) => post.source === "instagram");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Instagram</h1>
          <p className="mt-1 text-muted-foreground">Vues, engagement et performance de chacune de tes publications.</p>
        </div>
        <Link href="/acquisition/contenu" className="text-sm font-bold text-muted-foreground hover:underline">
          ← Retour au contenu
        </Link>
      </div>

      <InstagramView posts={instagramPosts} instagramInsights={instagramInsights} />
    </div>
  );
}
