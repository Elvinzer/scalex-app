"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";

import { removeCloser } from "./closer-actions";

type CloserActionCopy = {
  remove: string;
  title: string;
  description: string;
  confirm: string;
  cancel: string;
  pending: string;
};

export function RemoveCloserButton({ memberId, copy }: { memberId: string; copy: CloserActionCopy }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await removeCloser(memberId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="min-h-11"
        disabled={isPending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-busy={isPending}
      >
        {isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
        {copy.remove}
      </Button>
      <ConfirmationDialog
        open={open}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirm}
        cancelLabel={copy.cancel}
        pendingLabel={copy.pending}
        pending={isPending}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
