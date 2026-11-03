import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { businesses, teamMemberRoles, teamRoles } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";
import { getInviteByToken } from "@/lib/team/queries";
import { AcceptInviteForm } from "./accept-invite-form";
import { InviteSignInForm } from "./invite-sign-in-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("billing.invite");
  const invite = await getInviteByToken(token);
  const [business] = invite ? await db.select({ name: businesses.name }).from(businesses)
    .where(eq(businesses.id, invite.accountId)).limit(1) : [];
  if (!invite || !business) return <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
    <h1 className="text-2xl font-bold">{t("invalidTitle")}</h1>
    <p className="text-sm text-muted-foreground">{t("invalidHelp")}</p>
  </div>;
  const [identity, roleRows] = await Promise.all([
    getAuthIdentity(),
    db.select({ name: teamRoles.name }).from(teamMemberRoles)
      .innerJoin(teamRoles, and(eq(teamMemberRoles.roleId, teamRoles.id), eq(teamRoles.accountId, invite.accountId)))
      .where(eq(teamMemberRoles.teamMemberId, invite.id)),
  ]);
  const email = identity?.email?.toLowerCase();
  if (email && email !== invite.email.toLowerCase()) return <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
    <h1 className="text-2xl font-bold">{t("wrongAccountTitle")}</h1>
    <p className="text-sm text-muted-foreground">{t("wrongAccountHelp", { invitedEmail: invite.email, currentEmail: email })}</p>
  </div>;
  return <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
    <div className="text-center">
      <h1 className="text-2xl font-bold">{t("joinTitle", { name: business.name })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{roleRows.length ? t("roles", { roles: roleRows.map((role) => role.name).join(", ") }) : t("invited")}</p>
      {!email && <p className="mt-2 text-sm text-muted-foreground">{t("signInHelp", { email: invite.email })}</p>}
    </div>
    {email ? <AcceptInviteForm token={token} /> : <InviteSignInForm email={invite.email} token={token} />}
  </div>;
}
