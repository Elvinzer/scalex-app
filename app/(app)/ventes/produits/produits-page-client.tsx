"use client";

import { useState } from "react";

import { SalesSection } from "@/app/(app)/business/sales-section";
import type { BusinessSales } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";

export type OfferStats = { offerId: string; salesCount: number; revenue: number; avgBasket: number | null };

const RECURRENCE_LABEL: Record<string, string> = { one_shot: "One-shot", mensuel: "Mensuel", annuel: "Annuel" };
const TYPE_LABEL: Record<string, string> = {
  formation: "Formation",
  coaching: "Coaching",
  accompagnement: "Accompagnement",
  saas: "SaaS",
  autre: "Autre",
};

// Same lifted-state exception as business-page-client.tsx — SalesSection
// persists itself via its own saveBusinessSection call, this wrapper only
// mirrors state so the offer stat cards above stay in sync as offers are
// added/renamed/removed.
export function ProduitsPageClient({
  initialSales,
  offerStats,
}: {
  initialSales: BusinessSales;
  offerStats: OfferStats[];
}) {
  const [sales, setSales] = useState(initialSales);
  const statsByOfferId = new Map(offerStats.map((stat) => [stat.offerId, stat]));

  return (
    <div className="flex flex-col gap-8">
      {sales.offers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sales.offers.map((offer) => {
            const stats = statsByOfferId.get(offer.id);
            return (
              <div key={offer.id} className="sticker-card flex flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{offer.name || "Offre sans nom"}</p>
                  {offer.isMain && (
                    <span className="rounded-full bg-state-healthy-bg px-2 py-0.5 text-xs font-bold whitespace-nowrap text-state-healthy">
                      Principale
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {offer.price === null ? "Prix non renseigné" : formatEur(offer.price)}
                  {offer.type && ` · ${TYPE_LABEL[offer.type]}`}
                  {offer.recurrence && ` · ${RECURRENCE_LABEL[offer.recurrence]}`}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">CA ce mois</p>
                    <p className="font-bold tabular-nums">{formatEur(stats?.revenue ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ventes</p>
                    <p className="font-bold tabular-nums">{stats?.salesCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Panier moyen</p>
                    <p className="font-bold tabular-nums">
                      {stats?.avgBasket === null || stats?.avgBasket === undefined ? "—" : formatEur(Math.round(stats.avgBasket))}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SalesSection value={sales} onChange={setSales} />
    </div>
  );
}
