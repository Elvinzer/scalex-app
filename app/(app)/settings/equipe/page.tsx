import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getBusinessProfile } from "@/lib/business/queries";
import { getClosers } from "@/lib/closers/queries";
import { requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";
import { hasActiveTeamSubscription } from "@/lib/billing/plan-gate";
import { computeSettersCommissions, getSetters } from "@/lib/setters/queries";
import { ensureDefaultRoles } from "@/lib/team/roles";
import { getRoles, getTeamMembers } from "@/lib/team/queries";
import { PERMISSION_KEYS } from "@/lib/team/permissions";

import { AddSetterDialog } from "../../acquisition/setters/add-setter-dialog";
import { SetterCard } from "../../acquisition/setters/setter-card";
import { CreateRoleDialog } from "./create-role-dialog";
import { CloserCard } from "./closer-card";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MemberRow } from "./member-row";
import { RoleCard } from "./role-card";

const PERMISSION_OPTIONS = PERMISSION_KEYS.map((key) => ({ key }));

export default async function EquipePage() {
  const t = await getTranslations("settings.team");
  const tSetters = await getTranslations("app.setters");
  const userId = await requireUserId();
  const access = await requireOwnerOrRedirect(userId);
  const { accountId } = access;

  await ensureDefaultRoles(accountId);
  const [members, roles, subscriptionActive, setters, businessProfile, closers] = await Promise.all([
    getTeamMembers(accountId),
    getRoles(accountId),
    hasActiveTeamSubscription(accountId),
    getSetters(accountId),
    getBusinessProfile(accountId),
    getClosers(accountId),
  ]);
  const setterSummaries = await computeSettersCommissions(accountId, setters, businessProfile.sales.offers);

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
          <InviteMemberDialog roles={roles} triggerLabel={t("invite")} />
        )}
      </div>

      <nav aria-label={t("quickNav")} className="sticky top-2 z-10 flex gap-2 overflow-x-auto rounded-[var(--radius-card)] border border-border bg-panel/95 p-2 backdrop-blur">
        <a href="#members" className="min-h-10 shrink-0 rounded-[var(--radius-control)] px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("membersSection")}</a>
        <a href="#closers" className="min-h-10 shrink-0 rounded-[var(--radius-control)] px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("closersTitle")}</a>
        <a href="#setters" className="min-h-10 shrink-0 rounded-[var(--radius-control)] px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("settersSection")}</a>
        <a href="#roles" className="min-h-10 shrink-0 rounded-[var(--radius-control)] px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("rolesTitle")}</a>
      </nav>

      {!subscriptionActive && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("subscriptionRequired")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subscriptionHelp")}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/settings/facturation" prefetch={true}>{t("viewPlans")} →</Link>
          </Button>
        </div>
      )}

      <section id="members" className="scroll-mt-20 sticker-card overflow-hidden p-0" aria-labelledby="members-title">
        <div className="border-b border-border p-4"><h2 id="members-title" className="text-lg font-bold">{t("membersSection")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("membersHelp")}</p></div>
        <div className="overflow-x-auto" role="region" aria-label={t("membersTable")} tabIndex={0}>
        <p className="px-4 pt-3 text-xs text-muted-foreground md:hidden">{t("scrollHint")}</p>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-bold">{t("email")}</th>
              <th className="px-4 py-3 font-bold">{t("roles")}</th>
              <th className="px-4 py-3 font-bold">{t("status")}</th>
              <th className="px-4 py-3">
                <span className="sr-only">{t("actions")}</span>
              </th>
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
      </section>

      <section id="closers" aria-labelledby="closers-section-title" className="scroll-mt-20 flex flex-col gap-4 border-t border-border pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="closers-section-title" className="text-xl font-bold">{t("closersTitle")}</h2>
            <p className="mt-1 max-w-2xl text-muted-foreground">{t("closersHelp")}</p>
          </div>
          {subscriptionActive && (
            <InviteMemberDialog
              roles={roles}
              defaultRoleIds={roles.filter((role) => role.key === "closing").map((role) => role.id)}
              triggerLabel={t("addCloser")}
              triggerVariant="outline"
            />
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {closers.map((closer) => (
            <CloserCard key={closer.memberId ?? closer.userId} closer={closer} />
          ))}
        </div>
      </section>

      <section id="setters" aria-labelledby="setters-section-title" className="scroll-mt-20 flex flex-col gap-4 border-t border-border pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="setters-section-title" className="text-xl font-bold">{tSetters("title")}</h2>
            <p className="mt-1 text-muted-foreground">{tSetters("subtitle")}</p>
          </div>
          <AddSetterDialog triggerVariant="outline" />
        </div>

        {setters.length === 0 ? (
          <div className="sticker-card-dashed p-6">
            <p className="font-bold">{tSetters("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{tSetters("emptyHelp")}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {setters.map((setter, index) => (
              <SetterCard key={setter.id} setter={setter} summary={setterSummaries[index]} />
            ))}
          </div>
        )}
      </section>

      <div id="roles" className="scroll-mt-20 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-xl font-bold">{t("rolesTitle")}</h2>
          <p className="mt-1 text-muted-foreground">{t("rolesHelp")}</p>
        </div>
        <CreateRoleDialog permissionOptions={PERMISSION_OPTIONS} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={{ id: role.id, name: role.name, permissions: role.permissions as string[], isDefault: role.isDefault }}
            memberCount={members.filter((member) => member.roles.some((assignedRole) => assignedRole.id === role.id)).length}
            permissionOptions={PERMISSION_OPTIONS}
          />
        ))}
      </div>
    </div>
  );
}
