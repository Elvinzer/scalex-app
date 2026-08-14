"use client";

import { useState, useTransition } from "react";
import { Check, Circle, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { PERMISSION_GROUPS, type PermissionKey } from "@/lib/team/permissions";

import { deleteRole, updateRolePermissions } from "./actions";

type Role = { id: string; name: string; permissions: string[]; isDefault: boolean };

export function RoleCard({
  role,
  memberCount,
  permissionOptions,
}: {
  role: Role;
  memberCount: number;
  permissionOptions: { key: PermissionKey }[];
}) {
  const t = useTranslations("settings.team");
  const [permissions, setPermissions] = useState<string[]>(role.permissions);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(key: PermissionKey) {
    const previous = permissions;
    const next = permissions.includes(key) ? permissions.filter((p) => p !== key) : [...permissions, key];
    setPermissions(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateRolePermissions(role.id, next);
      if (result.error) {
        setPermissions(previous);
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  function handleDelete() {
    if (!confirm(t("deleteRoleConfirm", { name: role.name }))) return;
    startTransition(async () => {
      await deleteRole(role.id);
    });
  }

  return (
    <div className="sticker-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{role.name}</h3>
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
              {t(role.isDefault ? "defaultRole" : "customRole")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{t("permissionSummary", { count: permissions.length, total: permissionOptions.length })}</span>
            <span aria-hidden="true">·</span>
            <span>
              {memberCount === 0
                ? t("noMembersAssigned")
                : t("membersCount", { count: memberCount, plural: memberCount === 1 ? "" : "s" })}
            </span>
          </div>
        </div>
        {!role.isDefault && (
          <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={handleDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            {t("remove")}
          </Button>
        )}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{t("access")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("accessHelp")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground" role="group" aria-label={t("accessLegend")}>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-4 text-accent-text" aria-hidden="true" />
              {t("accessGranted")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Circle className="size-3.5" aria-hidden="true" />
              {t("noAccess")}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.key} className="min-w-0 rounded-[var(--radius-control)] border border-border bg-muted/20 p-3">
              <legend className="px-1 text-sm font-bold">{t(`permissionGroup.${group.key}`)}</legend>
              <p className="mt-1 text-xs text-muted-foreground">{t(`permissionGroupHelp.${group.key}`)}</p>
              <div className="mt-3 grid gap-2">
                {permissionOptions
                  .filter((option) => group.permissions.some((permission) => permission === option.key))
                  .map((option) => {
                    const active = permissions.includes(option.key);
                    return (
                      <button
                        key={option.key}
                        type="button"
                        disabled={isPending}
                        aria-pressed={active}
                        onClick={() => toggle(option.key)}
                        className={
                          active
                            ? "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-accent-border bg-accent-soft px-3 py-2 text-left text-sm font-bold text-accent-text transition-colors duration-200 hover:bg-accent-soft/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
                            : "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-left text-sm font-bold text-foreground transition-colors duration-200 hover:border-accent-border hover:bg-accent-soft/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
                        }
                      >
                        {active ? <Check className="size-4 shrink-0" aria-hidden="true" /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                        <span className="min-w-0">{t(`permission.${permissionKey(option.key)}`)}</span>
                      </button>
                    );
                  })}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-4 min-h-5 text-sm" aria-live="polite">
          {isPending && (
            <span className="inline-flex items-center gap-2 text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t("saving")}
            </span>
          )}
          {!isPending && saved && (
            <span className="inline-flex items-center gap-2 font-bold text-state-healthy" role="status">
              <Check className="size-4" aria-hidden="true" />
              {t("saved")}
            </span>
          )}
          {error && <p className="font-bold text-state-critical" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function permissionKey(key: PermissionKey): string {
  return key.replace(":", "_");
}
