"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PermissionKey } from "@/lib/team/permissions";

import { createRole } from "./actions";

export function CreateRoleDialog({
  permissionOptions,
}: {
  permissionOptions: { key: PermissionKey }[];
}) {
  const t = useTranslations("settings.team");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PermissionKey[]>([]);
  const [isPending, startTransition] = useTransition();

  function toggle(key: PermissionKey) {
    setSelected((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const data = { name: String(formData.get("name") ?? ""), permissions: selected };

    startTransition(async () => {
      const result = await createRole(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setSelected([]);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Plus className="size-4" />
          {t("newRole")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">{t("newRole")}</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("roleName")}</span>
            <input
              type="text"
              name="name"
              required
              placeholder={t("rolePlaceholder")}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("access")}</span>
            <div className="flex flex-wrap gap-2">
              {permissionOptions.map((option) => {
                const active = selected.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => toggle(option.key)}
                    className={
                      active
                        ? "rounded-full border border-accent-border bg-accent-soft px-3 py-1.5 text-sm font-bold text-accent-text"
                        : "rounded-full border border-border bg-background px-3 py-1.5 text-sm font-bold text-muted-foreground hover:border-accent-border"
                    }
                  >
                    {t(`permission.${permissionKey(option.key)}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? t("creating") : t("createRole")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function permissionKey(key: PermissionKey): string {
  return key.replace(":", "_");
}
