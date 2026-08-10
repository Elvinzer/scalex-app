import { getRequestConfig } from "next-intl/server";

import { getRequestLocale } from "./locale";
import { loadMessages } from "./messages";

// next-intl's server entry point. The locale comes from lib/i18n/locale.ts
// (user row first), never from a URL segment: the app uses the cookie/user
// strategy, so every existing route keeps its path unchanged.
export default getRequestConfig(async () => {
  const locale = await getRequestLocale();

  return {
    locale,
    messages: await loadMessages(locale),
    // Amounts are never converted (§D-4): a euro stays a euro in both
    // languages, only the formatting changes ("22 549 €" vs "€22,549").
    formats: {
      number: {
        eur: { style: "currency", currency: "EUR", maximumFractionDigits: 0 },
        percent: { style: "percent", maximumFractionDigits: 0 },
      },
      dateTime: {
        long: { day: "numeric", month: "long", year: "numeric" },
        short: { day: "2-digit", month: "2-digit", year: "numeric" },
      },
    },
    // A missing message must never blank a screen. loadMessages already
    // merges French underneath, so reaching here means the key exists in
    // NEITHER language — a developer error, surfaced as the key itself.
    onError() {},
    getMessageFallback({ key, namespace }) {
      return namespace ? `${namespace}.${key}` : key;
    },
    timeZone: "Europe/Paris",
    now: new Date(),
  };
});
