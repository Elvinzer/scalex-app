import { describe, expect, it } from "vitest";

import { falcoLanguageInstruction } from "./language-instruction";

describe("Falco language instruction", () => {
  it("locks replies to English even when the input or history uses another language", () => {
    const instruction = falcoLanguageInstruction("en");

    expect(instruction).toContain("Reply in English only");
    expect(instruction).toContain("conversation history");
    expect(instruction).toContain('"prompt" and "ignoreReason" fields');
    expect(instruction).not.toContain("Réponds uniquement");
  });

  it("locks replies to French even when the input or history uses another language", () => {
    const instruction = falcoLanguageInstruction("fr");

    expect(instruction).toContain("Réponds uniquement en français");
    expect(instruction).toContain("l'historique de conversation");
    expect(instruction).toContain("champs « prompt » et « ignoreReason »");
    expect(instruction).not.toContain("Reply in English only");
  });
});
