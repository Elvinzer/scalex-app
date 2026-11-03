import { describe, expect, it } from "vitest";
import { getInvoiceSubscriptionId } from "./stripe-invoice";

describe("Stripe invoice subscription references", () => {
  it("reads legacy string and expanded references", () => {
    expect(getInvoiceSubscriptionId({ id: "in_legacy", subscription: "sub_legacy" })).toBe("sub_legacy");
    expect(getInvoiceSubscriptionId({ id: "in_legacy", subscription: { id: "sub_legacy" } })).toBe("sub_legacy");
  });
  it("reads current subscription_details and gives it precedence", () => {
    expect(getInvoiceSubscriptionId({ id: "in_current", subscription: "sub_old", parent: { subscription_details: { subscription: "sub_current" } } })).toBe("sub_current");
  });
  it("ignores invoices without a subscription and rejects malformed references", () => {
    expect(getInvoiceSubscriptionId({ id: "in_one_off", parent: null })).toBeNull();
    expect(getInvoiceSubscriptionId({ id: "in_invalid", subscription: 123 })).toBeNull();
  });
});
