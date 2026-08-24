"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { inviteMember } from "./actions";

type RoleOption = { id: string; name: string };

export function InviteMemberDialog({
  roles,
  triggerLabel,
  triggerVariant = "default",
  defaultRoleIds = [],
}: {
  roles: RoleOption[];
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
  defaultRoleIds?: string[];
}) {
  const t = useTranslations("settings.team");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(defaultRoleIds);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setError(null);
    setManualLink(null);
    setCopied(false);
    setSelectedRoleIds(defaultRoleIds);
  }

  function toggleRole(roleId: string) {
    setSelectedRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const data = { email: String(formData.get("email") ?? ""), roleIds: selectedRoleIds };

    startTransition(async () => {
      const result = await inviteMember(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Sans email envoyé (Resend non configuré), on affiche le lien à partager.
      if (result.inviteUrl) {
        setManualLink(result.inviteUrl);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant}>
          <Plus className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">{t("invite")}</DialogTitle>

        {manualLink ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {t("manualInviteHelp")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs">
                {manualLink}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(manualLink);
                  setCopied(true);
                }}
              >
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <Button
              type="button"
              className="self-start"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              {t("done")}
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("email")}</span>
            <input
              type="email"
              name="email"
              required
              placeholder="prenom@email.com"
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("roles")}</span>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const active = selectedRoleIds.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={
                      active
                        ? "rounded-full border border-accent-border bg-accent-soft px-3 py-1.5 text-sm font-bold text-accent-text"
                        : "rounded-full border border-border bg-background px-3 py-1.5 text-sm font-bold text-muted-foreground hover:border-accent-border"
                    }
                  >
                    {role.name}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending || selectedRoleIds.length === 0} className="self-start">
            {isPending ? t("sending") : t("sendInvite")}
          </Button>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
