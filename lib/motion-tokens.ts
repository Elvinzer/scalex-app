// Mirrors the CSS motion vocabulary in app/globals.css (--motion-*, --ease-*)
// as numeric values usable by the `motion` library, which can't read CSS
// custom properties directly in a transition config. Keep both in sync.
export const MOTION_DURATION = {
  fast: 0.15, // --motion-fast
  base: 0.25, // --motion-base
  slow: 0.4, // --motion-slow
} as const;

export const MOTION_EASE = {
  out: [0.16, 1, 0.3, 1], // --ease-out: arrivals
  inOut: [0.65, 0, 0.35, 1], // --ease-in-out: movements
  spring: [0.34, 1.56, 0.64, 1], // --ease-spring: celebrations only
} as const;
