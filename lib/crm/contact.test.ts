import { describe, expect, it } from "vitest";

import { normalizeEmail, normalizePhoneForCountry, normalizeSearchText, normalizedPhoneFromWhatsAppUrl, whatsappHrefFromNormalizedPhone } from "./contact";

describe("CRM contact identity helpers", () => {
  it("normalizes valid international and national phones with explicit context", () => {
    expect(normalizePhoneForCountry("+33 6 87 88 03 10")).toEqual({ normalized: "+33687880310", reason: null });
    expect(normalizePhoneForCountry("06 87 88 03 10", "FR")).toEqual({ normalized: "+33687880310", reason: null });
    expect(normalizePhoneForCountry("06 87 88 03 10")).toEqual({ normalized: null, reason: "invalid" });
  });

  it("rejects invalid WhatsApp destinations and emits digits only", () => {
    expect(whatsappHrefFromNormalizedPhone("+33687880310")).toBe("https://wa.me/33687880310");
    expect(whatsappHrefFromNormalizedPhone("33687880310")).toBeNull();
    expect(whatsappHrefFromNormalizedPhone("+33000000000")).toBeNull();
    expect(normalizedPhoneFromWhatsAppUrl("https://www.wa.me/+33687880310/")).toBe("+33687880310");
    expect(normalizedPhoneFromWhatsAppUrl("https://wa.me/00033687880310")).toBeNull();
  });

  it("uses stable keys for names, handles and emails", () => {
    expect(normalizeSearchText("Alexandre_Mépuis")).toBe("alexandre mepuis");
    expect(normalizeSearchText("  Marie.de  La  Croix ")).toBe("marie de la croix");
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });
});
