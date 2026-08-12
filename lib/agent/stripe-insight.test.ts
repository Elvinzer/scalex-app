import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMessage } = vi.hoisted(() => ({ createMessage: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = { create: createMessage };

    constructor() {}
  },
}));

import { generateStripeInsight } from "./stripe-insight";

const snapshot = {
  version: "v1" as const,
  period: { key: "last_30d" as const, start: "2026-07-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" },
  currency: "eur",
  grossCents: 100_000,
  refundsCents: 12_000,
  netCents: 88_000,
  successfulTransactions: 8,
  failedTransactions: 2,
  pendingTransactions: 0,
  amountAtRiskCents: 20_000,
  recurringRevenueCents: 40_000,
  recurringSharePct: 40,
  uniqueCustomers: 6,
  customersWithKnownId: 6,
  customersWithoutId: 0,
  repeatCustomers: 2,
  repeatCustomerRatePct: 33.3,
  averageTicketCents: 12_500,
  refundRatePct: 12,
  failureRatePct: 20,
  topCustomerSharePct: 45,
  plannedAmountCents: 0,
  comparison: {
    grossCents: { current: 100_000, previous: 80_000, delta: 20_000, deltaPercent: 25 },
    refundsCents: { current: 12_000, previous: 8_000, delta: 4_000, deltaPercent: 50 },
    netCents: { current: 88_000, previous: 72_000, delta: 16_000, deltaPercent: 22.2 },
    successfulTransactions: { current: 8, previous: 6, delta: 2, deltaPercent: 33.3 },
  },
};

const signal = {
  type: "failures" as const,
  priority: "high" as const,
  title: "Des paiements sont échoués",
  summary: "Les échecs créent du CA à risque.",
  evidence: ["Taux d’échec : 20 %", "Montant à risque : 200 EUR"],
  action: "Traiter les impayés",
  actionHref: "#failed-payments",
};

describe("generateStripeInsight", () => {
  beforeEach(() => createMessage.mockReset());

  it("envoie seulement le snapshot et la preuve validés au modèle", async () => {
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: "Relance les paiements échoués cette semaine. Tu protèges 200 EUR de CA à risque." }],
      usage: { input_tokens: 111, output_tokens: 22 },
    });

    const result = await generateStripeInsight({ snapshot, signal, apiKey: "test-key-not-secret" });
    const request = createMessage.mock.calls[0]?.[0] as { system: string; messages: Array<{ content: string }> };

    expect(result.text).toContain("Relance");
    expect(result.inputTokens).toBe(111);
    expect(result.outputTokens).toBe(22);
    expect(request.system).toContain("N'invente jamais");
    expect(request.messages[0]?.content).toContain("Taux d’échec : 20 %");
    expect(request.messages[0]?.content).not.toContain("cus_");
  });

  it("refuse une réponse vide au lieu de persister un insight inutilisable", async () => {
    createMessage.mockResolvedValue({ content: [{ type: "text", text: "   " }], usage: { input_tokens: 1, output_tokens: 1 } });

    await expect(generateStripeInsight({ snapshot, signal, apiKey: "test-key-not-secret" })).rejects.toThrow("texte exploitable");
  });
});
