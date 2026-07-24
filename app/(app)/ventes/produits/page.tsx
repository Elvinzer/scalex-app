import { AgentBanner } from "@/components/agent-banner";
import { getAgentByKey } from "@/lib/agent/agents-registry";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { todayUtc } from "@/lib/date-range";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getSalesForMonth } from "@/lib/sales/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { ProduitsPageClient, type OfferStats } from "./produits-page-client";

export default async function ProduitsPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "business");

  const today = todayUtc();
  const [profile, monthSales, agent] = await Promise.all([
    getBusinessProfile(accountId),
    getSalesForMonth(accountId, today.getUTCFullYear(), today.getUTCMonth() + 1),
    getAgentByKey("produits"),
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
  const chatContext: ChatContext = { topicType: "lever", topicKey: "produits", topicLabel: "Produits", sourcePage: "ventes_produits" };
  const falcoSkin = resolveFalcoSkin("/ventes/produits");

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={stateText}
        ctaLabel="Améliorer →"
        chatContext={chatContext}
        mode="optimiser"
        agentName={agent?.name}
        agentIconKey={agent?.falcoSkinIcon}
        falcoSkin={falcoSkin}
      />
      <div>
        <h1 className="text-3xl font-bold">Produits</h1>
        <p className="mt-1 text-muted-foreground">Tes offres, et leurs chiffres du mois.</p>
      </div>
      <ProduitsPageClient initialSales={profile.sales} offerStats={offerStats} />
    </div>
  );
}
