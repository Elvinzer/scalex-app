// Deliberately zero imports (same reasoning as ./metric-keys.ts) — this is
// consumed directly from a "use client" component, so it must stay free of
// any server-only dependency.

export type HealthTier = "rouge" | "ambre" | "vert";

export type HealthTierStyle = {
  tier: HealthTier;
  colorText: string;
  colorBar: string;
  glow: string;
};

// score is expected to already be anchored to the metric's real status (see
// computeHealthScore in ./cascade.ts) — this function itself is a pure
// threshold lookup, reusable anywhere a 0-100 health score needs a color.
export function getHealthTier(score: number): HealthTierStyle {
  if (score < 40) {
    return { tier: "rouge", colorText: "#F09595", colorBar: "#E24B4A", glow: "rgba(226,75,74,0.22)" };
  }
  if (score < 70) {
    return { tier: "ambre", colorText: "#FAC775", colorBar: "#EF9F27", glow: "rgba(239,159,39,0.20)" };
  }
  return { tier: "vert", colorText: "#5DCAA5", colorBar: "#5DCAA5", glow: "rgba(93,202,165,0.18)" };
}
