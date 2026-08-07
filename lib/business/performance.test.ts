import { describe, expect, it } from "vitest";

import { buildOfferPerformance, buildUpsellPerformance } from "./performance";
import type { Offer } from "./types";
import type { SaleRow } from "@/lib/sales/types";

const offer = (overrides: Partial<Offer> = {}): Offer => ({
  id: "offer_main",
  name: "Programme principal",
  price: 1500,
  type: "accompagnement",
  saleMode: "appel_closing",
  recurrence: "one_shot",
  isMain: true,
  isUpsell: false,
  commissionSetterPct: null,
  ...overrides,
});

const sale = (overrides: Partial<SaleRow> = {}): SaleRow => ({
  id: "sale_1",
  clientName: "Client",
  clientEmail: null,
  sourceChannel: null,
  offerId: "offer_main",
  totalPrice: 1500,
  paymentType: "one_shot",
  paymentMethod: "virement",
  source: "manual",
  isOrphan: false,
  stripeCustomerId: null,
  installments: null,
  saleDate: "2026-08-07",
  closer: null,
  hasUpsell: false,
  upsellOfferId: null,
  upsellAmount: null,
  setterId: null,
  leadId: null,
  createdAt: "2026-08-07T00:00:00.000Z",
  ...overrides,
});

describe("business performance", () => {
  it("calculates offer metrics from sales without duplicating the offer editor", () => {
    const stats = buildOfferPerformance([offer()], [sale(), sale({ id: "sale_2", totalPrice: 1200 })]);

    expect(stats).toEqual([
      {
        offerId: "offer_main",
        salesCount: 2,
        revenue: 2700,
        avgBasket: 1350,
      },
    ]);
  });

  it("calculates upsell metrics from the same sales source", () => {
    const upsell = offer({ id: "offer_upsell", name: "Audit complémentaire", isMain: false, isUpsell: true, price: 300 });
    const stats = buildUpsellPerformance(
      [offer(), upsell],
      [
        sale({ hasUpsell: true, upsellOfferId: "offer_upsell", upsellAmount: 300 }),
        sale({ id: "sale_2", hasUpsell: false }),
      ]
    );

    expect(stats.takeRate).toBe(0.5);
    expect(stats.revenue).toBe(300);
    expect(stats.avgWithUpsell).toBe(1800);
    expect(stats.avgWithoutUpsell).toBe(1500);
    expect(stats.offers[0]).toMatchObject({
      offerId: "offer_upsell",
      salesCount: 1,
      takeRate: 0.5,
      revenue: 300,
      score: 100,
    });
  });
});
