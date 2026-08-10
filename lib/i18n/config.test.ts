import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_HTML_LANG,
  LOCALE_LABELS,
  isLocale,
  matchLocaleFromAcceptLanguage,
} from "./config";

describe("matchLocaleFromAcceptLanguage", () => {
  it("matches a regional tag to its base locale", () => {
    expect(matchLocaleFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(matchLocaleFromAcceptLanguage("fr-CA")).toBe("fr");
  });

  it("respects quality ordering rather than header position", () => {
    expect(matchLocaleFromAcceptLanguage("de-DE;q=0.9,en;q=0.8,fr;q=0.5")).toBe("en");
  });

  it("falls back to French for an unsupported language", () => {
    expect(matchLocaleFromAcceptLanguage("de-DE,de;q=0.9")).toBe(DEFAULT_LOCALE);
    expect(matchLocaleFromAcceptLanguage(null)).toBe(DEFAULT_LOCALE);
    expect(matchLocaleFromAcceptLanguage("")).toBe(DEFAULT_LOCALE);
  });

  it("survives a malformed header instead of throwing", () => {
    // Accept-Language is attacker-controlled: it must never be able to 500 a
    // page that only wanted to pick a language.
    expect(matchLocaleFromAcceptLanguage(";;;")).toBe(DEFAULT_LOCALE);
    expect(matchLocaleFromAcceptLanguage("en;q=notanumber")).toBe("en");
  });
});

describe("isLocale", () => {
  it("accepts only shipped locales", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    // A tampered cookie must never widen the set.
    expect(isLocale("../../etc/passwd")).toBe(false);
  });
});

describe("locale registry", () => {
  it("describes every shipped locale exactly once", () => {
    // Guards the "ready for a third language" requirement: adding a locale to
    // LOCALES without its label/lang tag would render a blank option in the
    // Réglages select rather than failing loudly.
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
      expect(LOCALE_HTML_LANG[locale]).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
    expect(new Set(LOCALES).size).toBe(LOCALES.length);
  });

  it("keeps French as the fallback", () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});
