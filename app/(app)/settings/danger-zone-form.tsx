"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

import { deleteAccount, resetAccountData } from "./actions";

export function DangerZoneForm({ email }: { email: string }) {
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
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/sign-in");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold">Réinitialiser mes données</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Efface tes chiffres, ton diagnostic, ton journal et ton équipe. Ton compte, ta clé API et Stripe restent
            intacts. Tu repars sur l&apos;onboarding, comme un nouveau compte.
          </p>
        </div>
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="shrink-0">
              Réinitialiser
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="text-lg font-bold">Réinitialiser toutes tes données ?</DialogTitle>
            <p className="mt-3 text-sm text-muted-foreground">
              Cette action efface définitivement : tes chiffres (Setting/Closing/Datas), ton diagnostic, ton profil
              business, tes imports, ton journal (projets, to-do, notes) et ton équipe (rôles, membres invités).
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Restent intacts : ton email, ta clé API Anthropic, ta connexion Stripe et ton abonnement Scale X.
            </p>
            {resetError && <p className="mt-3 text-sm text-state-critical">{resetError}</p>}
            <Button type="button" variant="destructive" disabled={isResetting} onClick={handleReset} className="mt-4">
              {isResetting ? "Réinitialisation..." : "Confirmer la réinitialisation"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-sm font-bold">Supprimer mon compte</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Suppression définitive et irréversible : ton compte, toutes tes données, ta connexion Stripe et ton
            abonnement Scale X.
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
              Supprimer le compte
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="text-lg font-bold">Supprimer définitivement ton compte ?</DialogTitle>
            <p className="mt-3 text-sm text-muted-foreground">
              Irréversible. Ton abonnement Scale X est annulé, ta connexion Stripe est révoquée, et absolument tout
              (chiffres, diagnostic, journal, équipe, clé API) est supprimé. Tu ne pourras plus te reconnecter avec ce
              compte.
            </p>
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">
                Tape <span className="font-bold text-foreground">{email}</span> pour confirmer
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
              {isDeleting ? "Suppression..." : "Supprimer définitivement"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
