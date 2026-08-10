import { DEFAULT_LOCALE, type Locale } from "./config";

// Every namespace shipped, in one list so a missing file fails loudly at
// build time instead of silently rendering raw keys on one page.
export const NAMESPACES = [
  "common",
  "auth",
  "navigation",
  "onboarding",
  "dashboard",
  "journal",
  "diagnostic",
  "content",
  "pipeline",
  "business",
  "data",
  "integrations",
  "sales",
  "booking",
  "referral",
  "settings",
  "falco",
  "app",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

type MessageTree = Record<string, unknown>;

// Deep-merges the requested locale over French so a key that hasn't been
// translated yet renders the French text rather than the raw key or an empty
// string (§D-3's "fallback FR si traduction manquante (jamais de vide)").
// next-intl's own fallback only covers a missing FILE; this covers a missing
// KEY inside an otherwise-translated file, which is the case that actually
// happens as translations land progressively.
function mergeDeep(base: MessageTree, override: MessageTree): MessageTree {
  const result: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = mergeDeep(existing, value);
    } else if (value !== undefined && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is MessageTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadMessagesFor(locale: Locale, namespacesToLoad: readonly Namespace[]): Promise<MessageTree> {
  const namespaces = await Promise.all(
    namespacesToLoad.map(async (namespace) => {
      // Relative, not the "@/" alias: the bundler builds a context module
      // from the literal prefix of a dynamic import, and an aliased path with
      // two interpolations resolves at build time but throws MODULE_NOT_FOUND
      // at runtime. This bit compiles AND runs.
      const fallback = (await import(`../../locales/${DEFAULT_LOCALE}/${namespace}.json`)).default as MessageTree;
      if (locale === DEFAULT_LOCALE) return [namespace, fallback] as const;

      const translated = (await import(`../../locales/${locale}/${namespace}.json`)).default as MessageTree;
      return [namespace, mergeDeep(fallback, translated)] as const;
    })
  );

  return Object.fromEntries(namespaces);
}

export async function loadMessages(locale: Locale): Promise<MessageTree> {
  return loadMessagesFor(locale, NAMESPACES);
}
