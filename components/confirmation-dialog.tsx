"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  detail?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmationDialog({
  open,
  title,
  description,
  detail,
  confirmLabel,
  cancelLabel,
  pending = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onCancel(); }}>
      <DialogContent
        className="max-w-[480px] p-0"
        aria-describedby="confirmation-dialog-description"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-state-caution/10 text-state-caution" aria-hidden="true">
              <AlertTriangle className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold tracking-tight">{title}</DialogTitle>
              <p id="confirmation-dialog-description" className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>

          {detail && <div className="mt-5 rounded-[var(--radius-control)] border border-border bg-muted/40 p-3 text-sm">{detail}</div>}

          {error && (
            <p className="mt-4 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm font-bold text-state-critical" role="alert">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="min-h-11" disabled={pending} onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button type="button" variant="destructive" size="lg" className="min-h-11" disabled={pending} onClick={onConfirm}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {pending ? "Annulation…" : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
