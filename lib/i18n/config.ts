// The single place a locale is declared. Adding a third language means
// adding it here plus its /locales/<code>/ files — nothing else in the app
// hardcodes "fr" or "en" (the checklist's "architecture prête pour une 3e
// langue").

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

// Shown in the Réglages select and the public switcher. Each language is
// written in ITSELF — an English speaker looking for their language scans
// for "English", not "Anglais".
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};

// Compact form for the public switcher ("FR / EN").
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  fr: "FR",
  en: "EN",
};

// BCP-47 tags for <html lang> and every Intl formatter. Kept separate from
// the locale code because they diverge as soon as a region matters
// (pt-BR vs pt-PT), and because `lang="fr"` is a correctness/a11y concern,
// not a translation one.
export const LOCALE_HTML_LANG: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-GB",
};

export const LOCALE_COOKIE = "minaly-locale";
// Long-lived: the cookie is only a mirror for pre-auth screens, but a
// visitor who picks English on the sign-in page should still get English
// when they come back a month later to finish signing up.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// Best match for an Accept-Language header, used ONLY to pre-select the
// onboarding choice and to serve signed-out screens. It never overrides a
// stored preference — §A: "Le navigateur sert uniquement à PRÉ-SÉLECTIONNER
// le choix à l'onboarding, jamais à décider seul ensuite."
export function matchLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params.find((param) => param.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), quality: quality ? Number(quality.split("=")[1]) || 0 : 1 };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    // "en-US" and "en" both match the "en" locale.
    const base = tag.split("-")[0];
    const match = LOCALES.find((locale) => locale === base);
    if (match) return match;
  }

  return DEFAULT_LOCALE;
}
