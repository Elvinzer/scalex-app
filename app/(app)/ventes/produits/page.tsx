import { AgentBanner } from "@/components/agent-banner";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { todayUtc } from "@/lib/date-range";
import { getSalesForMonth } from "@/lib/sales/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { ProduitsPageClient, type OfferStats } from "./produits-page-client";

export default async function ProduitsPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "business");

  const today = todayUtc();
  const [profile, monthSales] = await Promise.all([
    getBusinessProfile(accountId),
    getSalesForMonth(accountId, today.getUTCFullYear(), today.getUTCMonth() + 1),
  ]);

  const offerStats: OfferStats[] = profile.sales.offers.map((offer) => {
    const offerSales = monthSales.filter((sale) => sale.offerId === offer.id);
    const revenue = offerSales.reduce((sum, sale) => sum + sale.totalPrice, 0);
    return {
      offerId: offer.id,
      salesCount: offerSales.length,
      revenue,
      avgBasket: offerSales.length > 0 ? revenue / offerSales.length : null,
    };
  });

  const mainOffer = profile.sales.offers.find((offer) => offer.isMain);
  const stateText = mainOffer
    ? `Ton offre principale : ${mainOffer.name || "sans nom"}.`
    : "Aucune offre principale définie pour l'instant.";
  // No lever/metric tied to this page — general topic, same as Contenu.
  const chatContext: ChatContext = { topicType: "general", topicKey: null, topicLabel: null, sourcePage: "ventes_produits" };

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner stateText={stateText} ctaLabel="Améliorer →" chatContext={chatContext} />
      <div>
        <h1 className="text-3xl font-bold">Produits</h1>
        <p className="mt-1 text-muted-foreground">Tes offres, et leurs chiffres du mois.</p>
      </div>
      <ProduitsPageClient initialSales={profile.sales} offerStats={offerStats} />
    </div>
  );
}
