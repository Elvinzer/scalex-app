"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LEAD_LOST_REASON_LABELS, LEAD_LOST_REASONS, type LeadLostReason } from "@/lib/leads/types";

import { changeStageAction } from "./lead-actions";

// Opened when a lead is dragged onto "Perdu" — a motif is required
// (stageChangeSchema's own .refine also blocks this server-side).
export function LostReasonDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState<LeadLostReason | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (!reason) {
      setError("Choisis un motif.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await changeStageAction(leadId, { toStage: "perdu", lostReason: reason });
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Pourquoi ce lead est perdu ?</DialogTitle>
        <div className="mt-4 flex flex-col gap-2">
          {LEAD_LOST_REASONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setReason(value)}
              className={
                reason === value
                  ? "rounded-[var(--radius-control)] border border-accent bg-accent-soft px-3 py-2 text-left text-sm font-bold text-accent-text"
                  : "rounded-[var(--radius-control)] border border-border px-3 py-2 text-left text-sm hover:bg-muted"
              }
            >
              {LEAD_LOST_REASON_LABELS[value]}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-state-critical">{error}</p>}
        <Button className="mt-4 self-start" disabled={isPending} onClick={handleConfirm}>
          {isPending ? "Enregistrement..." : "Confirmer"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
