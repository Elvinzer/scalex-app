// The single vocabulary for every Falco animation — durations/thresholds
// only, the actual keyframes live in app/globals.css (Falco section) as
// CSS classes named to match these constants. No Falco animation should
// exist outside this file + that CSS section (grep "falco-" in globals.css
// to audit). See the plan's "no JS queue" decision: sequencing (morph
// before bubble-in) is achieved via CSS animation-delay + React `key`-
// driven remounts, not a JS animation engine — only the typewriter (which
// genuinely needs to reveal characters over time) has real JS state.
export const FALCO_MOTION = {
  bubbleIn: { durationMs: 220, delayMs: 150 },
  nudge: { durationMs: 180 },
  morph: { durationMs: 250 },
  bubbleOut: { durationMs: 150 },
  nod: { durationMs: 350 },
  blink: { durationMs: 120 },
  pageGreet: { durationMs: 250 },
  ponderingCycle: { durationMs: 400 },
} as const;

export const TYPEWRITER_MS_PER_CHAR = 25;
export const TYPEWRITER_MAX_MS = 2500;
// Above this length, a bubble is never typewritten regardless of the
// `typewriter` prop — matches the brief's own cap, and doubles as the
// reason the Copilote's (often long) responses never typewriter even if a
// caller mistakenly asked for it.
export const TYPEWRITER_MAX_CHARS = 200;

// 25ms/char, but capped at 2.5s total for the whole bubble — beyond that
// point the per-character delay shrinks so the full reveal still lands at
// exactly 2.5s instead of dragging out on a long bubble.
export function typewriterCharDelayMs(textLength: number): number {
  if (textLength <= 0) return TYPEWRITER_MS_PER_CHAR;
  const naive = textLength * TYPEWRITER_MS_PER_CHAR;
  return naive <= TYPEWRITER_MAX_MS ? TYPEWRITER_MS_PER_CHAR : TYPEWRITER_MAX_MS / textLength;
}

export function isTypewriterEligible(text: string): boolean {
  return text.length > 0 && text.length <= TYPEWRITER_MAX_CHARS;
}

export type FalcoReactionAnimation = "nod" | "happy-bounce" | "tilt-neutral";
