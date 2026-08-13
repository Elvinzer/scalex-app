"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { signOut } from "@/lib/supabase/client";

import { deleteAccount, resetAccountData } from "./actions";

export function DangerZoneForm({ email }: { email: string }) {
  const t = useTranslations("settings.page");
  const router = useRouter();

  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, startReset] = useTransition();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function handleReset() {
    setResetError(null);
    startReset(async () => {
      const result = await resetAccountData();
      if (result.error) {
        setResetError(result.error);
        return;
      }
      setResetOpen(false);
      router.push("/onboarding");
      router.refresh();
    });
  }

  function handleDelete() {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteAccount(confirmEmail);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      await signOut();
      router.push("/sign-in");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold">{t("resetData")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("resetDataHelp")}
          </p>
        </div>
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="shrink-0">
              {t("reset")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="text-lg font-bold">{t("resetConfirmTitle")}</DialogTitle>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("resetConfirmHelp")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("resetConfirmKeep")}
            </p>
            {resetError && <p className="mt-3 text-sm text-state-critical">{resetError}</p>}
            <Button type="button" variant="destructive" disabled={isResetting} onClick={handleReset} className="mt-4">
              {isResetting ? t("resetting") : t("confirmReset")}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold">{t("deleteAccount")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("deleteAccountHelp")}
          </p>
        </div>
        <Dialog
          open={deleteOpen}
          onOpenChange={(next) => {
            setDeleteOpen(next);
            if (!next) setConfirmEmail("");
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm" className="shrink-0">
              {t("deleteAccountButton")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="text-lg font-bold">{t("deleteConfirmTitle")}</DialogTitle>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("deleteConfirmHelp")}
            </p>
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">
                {t("typeToConfirm", { email })}
              </span>
              <input
                type="text"
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
                autoComplete="off"
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-state-critical focus-visible:ring-3 focus-visible:ring-state-critical/20"
              />
            </label>
            {deleteError && <p className="mt-3 text-sm text-state-critical">{deleteError}</p>}
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
              onClick={handleDelete}
              className="mt-4"
            >
              {isDeleting ? t("deleting") : t("deletePermanently")}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
