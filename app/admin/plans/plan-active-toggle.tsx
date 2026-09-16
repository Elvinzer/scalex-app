"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTransition } from "react";

import { setPlanActive } from "./actions";

export type PlanToggleCopy = {
  active: string;
  inactive: string;
  activeAria: string;
  inactiveAria: string;
  deactivateConfirm: string;
  activateConfirm: string;
  updated: string;
  updateError: string;
};

export function PlanActiveToggle({ id, isActive, planName, copy }: { id: string; isActive: boolean; planName: string; copy: PlanToggleCopy }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  function toggle() {
    const nextValue = !isActive;
    if (!nextValue && !window.confirm(copy.deactivateConfirm)) return;
    if (nextValue && !window.confirm(copy.activateConfirm)) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await setPlanActive(id, nextValue);
        if (result.error) {
          setFeedback({ message: result.error, isError: true });
          return;
        }
        setFeedback({ message: copy.updated, isError: false });
        router.refresh();
      } catch {
        setFeedback({ message: copy.updateError, isError: true });
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={isPending}
        onClick={toggle}
        aria-pressed={isActive}
        aria-label={`${planName}: ${isActive ? copy.activeAria : copy.inactiveAria}`}
        aria-busy={isPending}
        className={
          isActive
            ? "rounded-full border border-state-healthy/40 bg-state-healthy-bg px-3 py-1 text-xs font-bold text-state-healthy"
            : "rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-muted-foreground"
        }
      >
        {isActive ? copy.active : copy.inactive}
      </button>
      {feedback && <span role={feedback.isError ? "alert" : "status"} className={feedback.isError ? "text-xs text-state-critical" : "text-xs text-state-healthy"}>{feedback.message}</span>}
    </div>
  );
}
