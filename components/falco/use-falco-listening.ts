"use client";

import { useEffect, useRef, useState } from "react";

import type { FalcoPose } from "./falco";

const IDLE_BLINK_MS = 2000;

// Wires a conversational input (discovery/import-clarify/onboarding manual
// fields) to Falco's "listening" reactions: a held tilt while focused, a
// one-shot blink if the user pauses mid-typing, a nod on blur (their answer
// registered). `reactionKey` is meant to be spread onto the <Falco> as its
// React `key` — the same remount-driven replay used everywhere else in this
// system (see lib/falco-motion.ts), since a one-shot CSS animation on an
// already-mounted element doesn't replay just by re-adding the same class.
export function useFalcoListening() {
  const [focused, setFocused] = useState(false);
  const [reactionKey, setReactionKey] = useState(0);
  const [reactionClassName, setReactionClassName] = useState<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearIdleTimer() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }

  function armIdleBlink() {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      setReactionClassName("falco-blink");
      setReactionKey((key) => key + 1);
    }, IDLE_BLINK_MS);
  }

  useEffect(() => clearIdleTimer, []);

  function onFieldFocus() {
    setFocused(true);
    armIdleBlink();
  }

  function onFieldChange() {
    // Typing resets the idle window — the blink is only for a genuine pause.
    armIdleBlink();
  }

  function onFieldBlur() {
    setFocused(false);
    clearIdleTimer();
    setReactionClassName("falco-nod");
    setReactionKey((key) => key + 1);
  }

  const pose: FalcoPose | undefined = focused ? "thinking" : undefined;
  const className = focused ? "falco-tilt-listening" : (reactionClassName ?? undefined);

  return { pose, className, reactionKey, onFieldFocus, onFieldBlur, onFieldChange };
}
