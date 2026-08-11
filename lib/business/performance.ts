import type { SaleRow } from "@/lib/sales/types";

import type { Offer } from "./types";

const UPSELL_TAKE_RATE_BENCHMARK = 0.2;

export type OfferPerformance = {
  offerId: string;
  salesCount: number;
  revenue: number;
  avgBasket: number | null;
};

export type UpsellOfferPerformance = {
  offerId: string;
  salesCount: number;
  takeRate: number | null;
  revenue: number;
  score: number | null;
};

export type UpsellPerformance = {
  saleCount: number;
  takeRate: number | null;
  revenue: number;
  avgWithUpsell: number | null;
  avgWithoutUpsell: number | null;
  offers: UpsellOfferPerformance[];
};

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function scoreAgainstBenchmark(current: number, benchmark: number): number {
  return Math.max(0, Math.min(100, Math.round((current / benchmark) * 100)));
}

export function buildOfferPerformance(offers: Offer[], monthSales: SaleRow[]): OfferPerformance[] {
  const validSales = monthSales.filter((sale) => !sale.isOrphan);
  return offers.map((offer) => {
    const offerSales = validSales.filter((sale) => sale.offerId === offer.id);
    const revenue = offerSales.reduce((sum, sale) => sum + sale.totalPrice, 0);

    return {
      offerId: offer.id,
      salesCount: offerSales.length,
      revenue,
      avgBasket: average(offerSales.map((sale) => sale.totalPrice)),
    };
  });
}

export function buildUpsellPerformance(offers: Offer[], monthSales: SaleRow[]): UpsellPerformance {
  const validSales = monthSales.filter((sale) => !sale.isOrphan);
  const upsellSales = validSales.filter((sale) => sale.hasUpsell);
  const saleCount = validSales.length;
  const takeRate = saleCount > 0 ? upsellSales.length / saleCount : null;
  const revenue = upsellSales.reduce((sum, sale) => sum + (sale.upsellAmount ?? 0), 0);
  const upsellOffers = offers.filter((offer) => offer.isUpsell);

  return {
    saleCount,
    takeRate,
    revenue,
    avgWithUpsell: average(upsellSales.map((sale) => sale.totalPrice + (sale.upsellAmount ?? 0))),
    avgWithoutUpsell: average(validSales.filter((sale) => !sale.hasUpsell).map((sale) => sale.totalPrice)),
    offers: upsellOffers.map((offer) => {
      const offerSales = monthSales.filter((sale) => sale.upsellOfferId === offer.id);
      const offerTakeRate = saleCount > 0 ? offerSales.length / saleCount : null;

      return {
        offerId: offer.id,
        salesCount: offerSales.length,
        takeRate: offerTakeRate,
        revenue: offerSales.reduce((sum, sale) => sum + (sale.upsellAmount ?? 0), 0),
        score:
          offerTakeRate !== null && offerSales.length > 0
            ? scoreAgainstBenchmark(offerTakeRate, UPSELL_TAKE_RATE_BENCHMARK)
            : null,
      };
    }),
  };
}
