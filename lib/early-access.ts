export const EARLY_ACCESS_MODES = ["waitlist", "open"] as const;

export type EarlyAccessMode = (typeof EARLY_ACCESS_MODES)[number];

// Fail closed when the variable is missing or malformed. That keeps a fresh
// deployment in early-access mode until someone explicitly opens signups.
export function getEarlyAccessMode(): EarlyAccessMode {
  return process.env.EARLY_ACCESS_MODE === "open" ? "open" : "waitlist";
}

export function isEarlyAccessMode(): boolean {
  return getEarlyAccessMode() === "waitlist";
}

export const EARLY_ACCESS_CONSENT_VERSION = "2026-09-24";
