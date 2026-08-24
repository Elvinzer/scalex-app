import { describe, expect, it } from "vitest";

import { detectFalcoMessageLocale, falcoLanguageInstruction, resolveFalcoResponseLocale } from "./language-instruction";

describe("Falco language instruction", () => {
  it("uses the platform language by default while allowing a language switch", () => {
    const instruction = falcoLanguageInstruction("en");

    expect(instruction).toContain("Use English by default");
    expect(instruction).toContain("clearly French");
    expect(instruction).toContain("ongoing conversation");
    expect(instruction).toContain('"prompt" and "ignoreReason" fields');
    expect(instruction).not.toContain("Reply in English only");
  });

  it("switches to French when an English platform user writes in French", () => {
    const instruction = falcoLanguageInstruction("en", "fr");

    expect(instruction).toContain("La langue de la plateforme est l'anglais");
    expect(instruction).toContain("dernier message de l'utilisateur est en français");
    expect(instruction).toContain("Réponds en français pour ce tour");
    expect(instruction).not.toContain("Réponds uniquement en français");
  });

  it("keeps French as the default platform language", () => {
    const instruction = falcoLanguageInstruction("fr");

    expect(instruction).toContain("Utilise le français par défaut");
    expect(instruction).toContain("clairement en anglais");
    expect(instruction).toContain("conversation en cours");
    expect(instruction).toContain("champs « prompt » et « ignoreReason »");
    expect(instruction).not.toContain("Réponds uniquement en français");
  });
});

describe("detectFalcoMessageLocale", () => {
  it("detects a clear French message", () => {
    expect(detectFalcoMessageLocale("Je veux améliorer mon taux de closing, merci.")).toBe("fr");
    expect(detectFalcoMessageLocale("Bonjour Falco")).toBe("fr");
    expect(detectFalcoMessageLocale("Et au niveau du taux de closing ?")).toBe("fr");
  });

  it("detects a clear English message", () => {
    expect(detectFalcoMessageLocale("Can you help me improve my closing rate?")).toBe("en");
    expect(detectFalcoMessageLocale("Hello Falco")).toBe("en");
  });

  it("does not override the platform for an ambiguous technical message", () => {
    expect(detectFalcoMessageLocale("33% vs benchmark")).toBeNull();
    expect(resolveFalcoResponseLocale("en", "33% vs benchmark")).toBe("en");
    expect(resolveFalcoResponseLocale("fr", "33% vs benchmark")).toBe("fr");
  });
});
