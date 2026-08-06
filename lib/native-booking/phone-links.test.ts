import { describe, expect, it } from "vitest";

import { internationalPhoneForLink, phoneHref, whatsappHref } from "./phone-links";

describe("native booking phone links", () => {
  it("keeps the plus on an E.164 number", () => {
    expect(internationalPhoneForLink("+33 6 40 47 70 52")).toBe("+33640477052");
  });

  it("restores the plus on legacy international digits", () => {
    expect(internationalPhoneForLink("33640477052")).toBe("+33640477052");
  });

  it("adds the French calling code to a national number", () => {
    expect(internationalPhoneForLink("06 40 47 70 52")).toBe("+33640477052");
  });

  it("builds actionable tel and WhatsApp links", () => {
    expect(phoneHref("33640477052")).toBe("tel:+33640477052");
    expect(whatsappHref("33640477052", "Bonjour")).toBe("https://wa.me/33640477052?text=Bonjour");
  });
});
