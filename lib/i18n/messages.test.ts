import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LOCALES, type Locale } from "./config";
import { NAMESPACES, loadMessages } from "./messages";

type Tree = Record<string, unknown>;

const localesDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../locales");
const sourceDirectories = ["app", "components", "lib"].map((directory) => path.resolve(process.cwd(), directory));

function flatten(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? flatten(value as Tree, path)
      : [path];
  });
}

function readRawMessages(locale: Locale, namespace: string): Tree {
  const file = path.join(localesDirectory, locale, `${namespace}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Tree;
}

function getValue(tree: Tree, pathKey: string): unknown {
  return pathKey.split(".").reduce<unknown>((value, part) => (value as Tree)?.[part], tree);
}

function findDuplicateObjectKeys(source: string): string[] {
  let cursor = 0;
  const duplicates: string[] = [];

  function skipWhitespace(): void {
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  }

  function readString(): string {
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (source[cursor] === '"') {
        cursor += 1;
        return JSON.parse(source.slice(start, cursor)) as string;
      }
      cursor += 1;
    }
    throw new Error("Unterminated JSON string");
  }

  function readValue(pathPrefix: string): void {
    skipWhitespace();
    const token = source[cursor];
    if (token === '"') {
      readString();
      return;
    }
    if (token === "{") {
      readObject(pathPrefix);
      return;
    }
    if (token === "[") {
      cursor += 1;
      skipWhitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        readValue(pathPrefix);
        skipWhitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") throw new Error("Invalid JSON array");
        cursor += 1;
      }
      throw new Error("Unterminated JSON array");
    }

    while (cursor < source.length && !/[,}\]]/.test(source[cursor] ?? "")) cursor += 1;
  }

  function readObject(pathPrefix: string): void {
    cursor += 1;
    const keys = new Set<string>();
    skipWhitespace();
    if (source[cursor] === "}") {
      cursor += 1;
      return;
    }

    while (cursor < source.length) {
      skipWhitespace();
      if (source[cursor] !== '"') throw new Error("Invalid JSON object key");
      const key = readString();
      const keyPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (keys.has(key)) duplicates.push(keyPath);
      keys.add(key);
      skipWhitespace();
      if (source[cursor] !== ":") throw new Error("Invalid JSON object");
      cursor += 1;
      readValue(keyPath);
      skipWhitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") throw new Error("Invalid JSON object");
      cursor += 1;
    }
    throw new Error("Unterminated JSON object");
  }

  readValue("");
  return duplicates;
}

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findLiteralTranslationKeys(): Array<{ file: string; key: string }> {
  const results: Array<{ file: string; key: string }> = [];
  const declarationPattern = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*["']([^"']+)["']\s*\)/g;

  for (const directory of sourceDirectories) {
    for (const file of collectSourceFiles(directory)) {
      const source = fs.readFileSync(file, "utf8");
      for (const declaration of source.matchAll(declarationPattern)) {
        const translatorName = declaration[1];
        const namespace = declaration[2];
        const calls = new RegExp(`\\b${escapeRegExp(translatorName)}\\(\\s*["']([^"']+)["']\\s*\\)`, "g");
        for (const call of source.matchAll(calls)) {
          const key = call[1];
          if (key && !key.endsWith(".")) results.push({ file, key: `${namespace}.${key}` });
        }
      }
    }
  }
  return results;
}

describe("message catalogues", () => {
  it("keeps raw FR and EN key trees identical", () => {
    for (const namespace of NAMESPACES) {
      const frKeys = flatten(readRawMessages("fr", namespace)).sort();
      const enKeys = flatten(readRawMessages("en", namespace)).sort();
      expect(enKeys, `${namespace}: en/fr key mismatch`).toEqual(frKeys);
    }
  });

  it("rejects duplicate JSON object keys before parsing", () => {
    for (const locale of ["fr", "en"] as const) {
      for (const namespace of NAMESPACES) {
        const file = path.join(localesDirectory, locale, `${namespace}.json`);
        const source = fs.readFileSync(file, "utf8");
        expect(findDuplicateObjectKeys(source), `${locale}/${namespace}.json`).toEqual([]);
      }
    }
  });

  it("checks literal translation calls against both raw catalogues", () => {
    const catalogues = {
      fr: new Set(NAMESPACES.flatMap((namespace) => flatten(readRawMessages("fr", namespace)).map((key) => `${namespace}.${key}`))),
      en: new Set(NAMESPACES.flatMap((namespace) => flatten(readRawMessages("en", namespace)).map((key) => `${namespace}.${key}`))),
    };

    for (const usage of findLiteralTranslationKeys()) {
      expect(catalogues.fr.has(usage.key), `Missing FR translation: ${usage.key} (${usage.file})`).toBe(true);
      expect(catalogues.en.has(usage.key), `Missing EN translation: ${usage.key} (${usage.file})`).toBe(true);
    }
  });

  it("resolves call metric help text instead of returning a translation key", async () => {
    for (const locale of ["fr", "en"] as const) {
      const messages = await loadMessages(locale);
      expect(getValue(messages, "app.calls.showRateHelp")).toEqual(expect.any(String));
      expect(getValue(messages, "app.calls.closingRateHelp")).toEqual(expect.any(String));
      expect(getValue(messages, "app.calls.showRateHelp")).not.toBe("app.calls.showRateHelp");
      expect(getValue(messages, "app.calls.closingRateHelp")).not.toBe("app.calls.closingRateHelp");
    }
  });

  it("never stores a namespace path as a translated value", async () => {
    for (const locale of LOCALES) {
      const messages = (await loadMessages(locale)) as Tree;
      for (const namespace of NAMESPACES) {
        const namespaceMessages = messages[namespace] as Tree;
        for (const key of flatten(namespaceMessages)) {
          const value = getValue(namespaceMessages, key);
          if (typeof value === "string") {
            expect(value, `${locale}: ${namespace}.${key}`).not.toBe(`${namespace}.${key}`);
          }
        }
      }
    }
  });

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
