import { describe, expect, it } from "vitest";

import {
  calculateGrowthDiagnostic,
  questionsActives,
  type GrowthAnswers,
} from "./landing-diagnostic";

const benchmarks = {
  responseRate: 0.4,
  proposalRate: 0.25,
  bookingRate: 0.6,
  showUpRate: 0.7,
  closingRate: 0.3,
};

const completeAnswers: GrowthAnswers = {
  audience: 3_000,
  leads: 90,
  rdvPris: 20,
  rdvHonores: 13,
  ventes: 3,
  prix: 1_500,
  retention: 0.6,
  heures: 45,
  delegation: 0.33,
  systemeAcq: "magnet",
  convSysteme: 0.02,
  emails: "auto",
  convEmail: 0.02,
  contenu: 0.66,
  plateforme: ["ig", "li"],
  adsActif: "continu",
  adsBudget: 1_200,
  adsRetour: "precis",
  adsCA: 3_600,
  suivi: 0.66,
  leviers: ["webinaire", "newsletter"],
};

describe("landing growth diagnostic", () => {
  it("keeps conditional questions out until their parent answer exists", () => {
    expect(questionsActives({}).map((question) => question.id)).not.toContain("convEmail");
    expect(questionsActives({ emails: "auto" }).map((question) => question.id)).toContain("convEmail");
    expect(questionsActives({ contenu: 0 }).map((question) => question.id)).not.toContain("plateforme");
    expect(questionsActives({ contenu: 1 }).map((question) => question.id)).toContain("plateforme");
  });

  it("uses the app benchmark snapshot in the projected axis targets", () => {
    const result = calculateGrowthDiagnostic(completeAnswers, benchmarks);
    const appointmentAxis = result.axisScores.find((axis) => axis.id === "rdv");

    expect(result.benchmarks).toEqual(benchmarks);
    expect(appointmentAxis?.target).toBeCloseTo(0.15);
    expect(result.axisScores).toHaveLength(6);
    expect(result.global).toBeGreaterThanOrEqual(0);
    expect(result.global).toBeLessThanOrEqual(100);
  });

  it("returns a bottleneck and bounded gains for a weak funnel", () => {
    const result = calculateGrowthDiagnostic(
      {
        ...completeAnswers,
        leads: 15,
        rdvPris: 1,
        rdvHonores: 0,
        ventes: 0,
        leviers: ["webinaire", "vsl", "newsletter", "seo", "podcast"],
      },
      benchmarks
    );

    expect(["presence", "closing", "rdv"]).toContain(result.bottleneck.id);
    expect(result.bottleneckGain).toBeGreaterThanOrEqual(0);
    expect(result.totalPotential).toBeGreaterThanOrEqual(result.revenueAfterBottleneck);
    expect(result.levers.every((lever) => lever.amount >= 0)).toBe(true);
  });
});
