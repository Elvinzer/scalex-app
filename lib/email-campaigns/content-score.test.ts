import { describe, expect, it } from "vitest";

import { computeEmailContentScore } from "./content-score";

describe("computeEmailContentScore", () => {
  it("returns no score until the sent email text is provided", () => {
    expect(computeEmailContentScore({ subject: "Une idée", body: null }).score).toBeNull();
  });

  it("detects risky words and keeps the score bounded", () => {
    const result = computeEmailContentScore({
      subject: "Offre urgente et gratuite",
      body: "Cliquez ici maintenant ! Offre garantie et gratuite.\n\nRépondez à cet email pour découvrir le programme et réserver votre place.",
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.dangerousWords).toEqual(expect.arrayContaining(["urgent", "gratuit", "garanti", "cliquez ici"]));
    expect(result.deliverability).toBeLessThan(100);
  });

  it("rewards consistent subject terms and readable structure", () => {
    const result = computeEmailContentScore({
      subject: "Préparer ton lancement de newsletter",
      body: "Voici les trois étapes pour préparer ton lancement de newsletter.\n\nCommence par clarifier ton sujet, puis écris une promesse simple. Réponds à cet email si tu veux que je te donne un exemple.",
    });

    expect(result.seo).toBeGreaterThan(60);
    expect(result.structure).toBeGreaterThan(60);
    expect(result.readability).toBeGreaterThan(60);
  });
});
