import { describe, expect, it } from "vitest";

import {
  formatSubscriptionAmount,
  formatSubscriptionStatus,
  getSubscriptionStatusTone,
} from "./admin-subscription-format";

describe("admin subscription formatting", () => {
  it("labels every current Stripe status without relying on its color", () => {
    expect(formatSubscriptionStatus("active")).toBe("Actif");
    expect(formatSubscriptionStatus("trialing")).toBe("Essai en cours");
    expect(formatSubscriptionStatus("past_due")).toBe("Paiement en retard");
    expect(formatSubscriptionStatus("unpaid")).toBe("Impayé");
    expect(formatSubscriptionStatus("canceled")).toBe("Annulé");
    expect(formatSubscriptionStatus("incomplete")).toBe("Paiement incomplet");
    expect(formatSubscriptionStatus("incomplete_expired")).toBe("Paiement expiré");
    expect(formatSubscriptionStatus("paused")).toBe("En pause");
    expect(formatSubscriptionStatus("future_status")).toBe("Statut inconnu");
  });

  it("keeps healthy and risk states semantically distinct", () => {
    expect(getSubscriptionStatusTone("active")).toBe("healthy");
    expect(getSubscriptionStatusTone("past_due")).toBe("caution");
    expect(getSubscriptionStatusTone("unpaid")).toBe("critical");
    expect(getSubscriptionStatusTone("future_status")).toBe("neutral");
  });

  it("does not invent a historical amount when the Price snapshot is missing", () => {
    expect(formatSubscriptionAmount(4900)).toBe("$49");
    expect(formatSubscriptionAmount(null)).toBe("À vérifier");
  });
});
