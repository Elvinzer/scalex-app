"use client";

import { useEffect, useRef, useState } from "react";

import { isTypewriterEligible, typewriterCharDelayMs } from "@/lib/falco-motion";
import { cn } from "@/lib/utils";

import { useFalcoAnimationsEnabled } from "./falco-context";

// Speech bubble attached to Falco. Design-system compliant: no offset drop
// shadow (only --shadow-float when it genuinely floats over content), tokens
// only — the dark variant uses --surface-dark-2 (the spec's raw #211F18 is
// not a token) with a subtle white border rather than introducing new hex.
// `arrow` is the edge the little pointer sits on (pointing toward Falco).
export function FalcoBubble({
  children,
  text,
  typewriter = false,
  onTypewriterDone,
  onDark = false,
  arrow = "left",
  floating = false,
  className,
}: {
  children?: React.ReactNode;
  // Typewriter-eligible plain text — replaces `children` for a simple
  // string. `children` stays supported as-is (JSX with <strong> etc.) and
  // is never typewritten, so existing call sites never regress.
  text?: string;
  typewriter?: boolean;
  // Fires once the bubble's text is fully visible — immediately when there's
  // no typewriter, so callers gating reply buttons/fields on this never
  // stall waiting for an animation that isn't happening.
  onTypewriterDone?: () => void;
  onDark?: boolean;
  // "none" = no pointer (used in the onboarding thread, where a single Falco
  // sits above a column of bubbles rather than beside each one).
  arrow?: "left" | "right" | "none";
  floating?: boolean;
  className?: string;
}) {
  const animationsEnabled = useFalcoAnimationsEnabled();
  const shouldTypewrite = typewriter && !!text && animationsEnabled && isTypewriterEligible(text);

  const [revealedLength, setRevealedLength] = useState(shouldTypewrite ? 0 : (text?.length ?? 0));
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;

    if (!shouldTypewrite || !text) {
      setRevealedLength(text?.length ?? 0);
      doneRef.current = true;
      onTypewriterDone?.();
      return;
    }

    setRevealedLength(0);
    let cancelled = false;
    let charIndex = 0;
    const delay = typewriterCharDelayMs(text.length);

    const tick = () => {
      if (cancelled) return;
      charIndex += 1;
      setRevealedLength(charIndex);
      if (charIndex >= text.length) {
        doneRef.current = true;
        onTypewriterDone?.();
        return;
      }
      timeoutId = setTimeout(tick, delay);
    };

    let timeoutId = setTimeout(tick, delay);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // onTypewriterDone is intentionally excluded — callers pass inline
    // closures; keying off text/shouldTypewrite alone is what tells us a
    // genuinely new turn started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, shouldTypewrite]);

  const isRevealing = shouldTypewrite && revealedLength < (text?.length ?? 0);

  function handleSkip() {
    if (!isRevealing || !text) return;
    setRevealedLength(text.length);
    doneRef.current = true;
    onTypewriterDone?.();
  }

  return (
    <div
      onClick={isRevealing ? handleSkip : undefined}
      className={cn(
        "relative max-w-[240px] rounded-[var(--radius-card)] border px-4 py-3 text-sm font-bold",
        onDark
          ? "border-white/10 bg-[var(--surface-dark-2)] text-[var(--text-on-dark)]"
          : "border-border bg-surface text-foreground",
        floating && "shadow-[var(--shadow-float)]",
        animationsEnabled && "falco-bubble-in",
        isRevealing && "cursor-pointer",
        className
      )}
    >
      {arrow !== "none" && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-2.5 -translate-y-1/2 rotate-45 border",
            onDark ? "border-white/10 bg-[var(--surface-dark-2)]" : "border-border bg-surface",
            arrow === "left" ? "left-0 -translate-x-1/2 border-t-0 border-r-0" : "right-0 translate-x-1/2 border-b-0 border-l-0"
          )}
        />
      )}
      {text !== undefined ? (
        <>
          {text.slice(0, revealedLength)}
          {isRevealing && <span aria-hidden className="falco-cursor-blink">|</span>}
        </>
      ) : (
        children
      )}
    </div>
  );
}
