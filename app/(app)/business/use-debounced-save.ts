"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { setBusinessChangePending } from "@/components/businesses/pending-changes";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Client-side debounce in front of a Server Action — there's no server-side
// debouncing here, each call is a full section save. 800ms per CLAUDE.md's
// "Mon business" spec (auto-save, no submit button, discreet indicator).
export function useDebouncedSave<T>(
  save: (value: T) => Promise<{ error: string | null }>,
  delayMs = 800
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const changeKey = useRef(Symbol("business-change"));
  const revision = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [, startTransition] = useTransition();

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    setBusinessChangePending(changeKey.current, false);
  }, []);

  const schedule = useCallback(
    (value: T) => {
      const currentRevision = ++revision.current;
      setBusinessChangePending(changeKey.current, true);
      setStatus("saving");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        startTransition(async () => {
          const result = await save(value);
          if (result.error) {
            setError(result.error);
            setStatus("error");
          } else {
            if (revision.current === currentRevision) setBusinessChangePending(changeKey.current, false);
            setError(null);
            setStatus("saved");
          }
        });
      }, delayMs);
    },
    [save, delayMs]
  );

  return { schedule, status, error };
}
