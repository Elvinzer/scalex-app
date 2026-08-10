import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";
import { hasActiveTeamSubscription } from "@/lib/billing/plan-gate";
import { ensureDefaultRoles } from "@/lib/team/roles";
import { getRoles, getTeamMembers } from "@/lib/team/queries";
import { PERMISSION_KEYS } from "@/lib/team/permissions";

import { CreateRoleDialog } from "./create-role-dialog";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MemberRow } from "./member-row";
import { RoleCard } from "./role-card";

const PERMISSION_OPTIONS = PERMISSION_KEYS.map((key) => ({ key }));

export default async function EquipePage() {
  const t = await getTranslations("settings.team");
  const userId = await requireUserId();
  const access = await requireOwnerOrRedirect(userId);
  const { accountId } = access;

  await ensureDefaultRoles(accountId);
  const [members, roles, subscriptionActive] = await Promise.all([
    getTeamMembers(accountId),
    getRoles(accountId),
    hasActiveTeamSubscription(accountId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {subscriptionActive && (
          <InviteMemberDialog
            roles={roles}
            trigger={
              <Button type="button">
                <Plus className="size-4" />
                {t("invite")}
              </Button>
            }
          />
        )}
      </div>

      {!subscriptionActive && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("subscriptionRequired")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subscriptionHelp")}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <a href="/settings/facturation">{t("viewPlans")} →</a>
          </Button>
        </div>
      )}

      <div className="sticker-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-bold">{t("email")}</th>
              <th className="px-4 py-3 font-bold">{t("roles")}</th>
              <th className="px-4 py-3 font-bold">{t("status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                roles={roles}
                statusLabel={t(member.status === "invited" ? "invited" : member.status === "active" ? "active" : "status")}
              />
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  {t("noMembers")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-xl font-bold">{t("rolesTitle")}</h2>
          <p className="mt-1 text-muted-foreground">{t("rolesHelp")}</p>
        </div>
        <CreateRoleDialog
          permissionOptions={PERMISSION_OPTIONS}
          trigger={
            <Button type="button" variant="outline">
              <Plus className="size-4" />
              {t("newRole")}
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-4">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={{ id: role.id, name: role.name, permissions: role.permissions as string[], isDefault: role.isDefault }}
            permissionOptions={PERMISSION_OPTIONS}
          />
        ))}
      </div>
    </div>
  );
}
