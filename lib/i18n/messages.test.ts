import { describe, expect, it } from "vitest";

import { LOCALES, type Locale } from "./config";
import { NAMESPACES, loadMessages } from "./messages";

type Tree = Record<string, unknown>;

function flatten(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? flatten(value as Tree, path)
      : [path];
  });
}

describe("message catalogues", () => {
  it("ships every namespace in every locale", async () => {
    for (const locale of LOCALES) {
      const messages = (await loadMessages(locale)) as Tree;
      for (const namespace of NAMESPACES) {
        expect(messages[namespace], `${locale}/${namespace}.json`).toBeDefined();
      }
    }
  });

  it("falls back to French for a key missing from a translation", async () => {
    // The rule that keeps a half-translated screen readable: a missing key
    // renders French, never an empty string and never the raw key.
    const en = (await loadMessages("en")) as Tree;
    const fr = (await loadMessages("fr")) as Tree;

    const frKeys = flatten(fr);
    const enKeys = new Set(flatten(en));
    for (const key of frKeys) {
      expect(enKeys.has(key), `"${key}" disappeared in en`).toBe(true);
    }
  });

  it("never yields an empty string for a shipped key", async () => {
    for (const locale of LOCALES) {
      const messages = (await loadMessages(locale)) as Tree;
      for (const key of flatten(messages)) {
        const value = key.split(".").reduce<unknown>((node, part) => (node as Tree)?.[part], messages);
        expect(String(value).length, `${locale}: ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the bilingual onboarding bubble bilingual in both catalogues", async () => {
    // This screen is shown before the language is known, so both lines must
    // survive translation in BOTH files — an "en" catalogue that translated
    // the French line into English would defeat the whole step.
    for (const locale of LOCALES as readonly Locale[]) {
      const messages = (await loadMessages(locale)) as Tree;
      const onboarding = (messages.onboarding as Tree).language as Tree;
      expect(String(onboarding.bubbleFr)).toContain("Falco");
      expect(String(onboarding.bubbleEn)).toContain("Falco");
      expect(String(onboarding.bubbleFr)).not.toBe(String(onboarding.bubbleEn));
    }
  });
});
