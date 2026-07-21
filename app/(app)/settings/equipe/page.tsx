import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";
import { hasActiveTeamSubscription } from "@/lib/billing/plan-gate";
import { ensureDefaultRoles } from "@/lib/team/roles";
import { getRoles, getTeamMembers } from "@/lib/team/queries";

import { InviteMemberDialog } from "./invite-member-dialog";
import { MemberRow } from "./member-row";

const STATUS_LABELS: Record<string, string> = { invited: "Invitation envoyée", active: "Actif" };

export default async function EquipePage() {
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
          <h1 className="text-3xl font-bold">Équipe</h1>
          <p className="mt-1 text-muted-foreground">
            Invite des membres et attribue-leur un ou plusieurs rôles — configurables dans{" "}
            <a href="/settings/roles" className="font-bold text-signal underline">
              Rôles &amp; permissions
            </a>
            .
          </p>
        </div>
        {subscriptionActive && (
          <InviteMemberDialog
            roles={roles}
            trigger={
              <Button type="button">
                <Plus className="size-4" />
                Inviter un membre
              </Button>
            }
          />
        )}
      </div>

      {!subscriptionActive && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Abonnement requis</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Les membres d&apos;équipe nécessitent un abonnement Scale X actif incluant cette
            fonctionnalité.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <a href="/settings/facturation">Voir les plans →</a>
          </Button>
        </div>
      )}

      <div className="sticker-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-bold">Email</th>
              <th className="px-4 py-3 font-bold">Rôles</th>
              <th className="px-4 py-3 font-bold">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                roles={roles}
                statusLabel={STATUS_LABELS[member.status] ?? member.status}
              />
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun membre pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
