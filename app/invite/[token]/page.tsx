import { eq } from "drizzle-orm";

import { db } from "@/db";
import { teamMemberRoles, teamRoles } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { createClient } from "@/lib/supabase/server";
import { getInviteByToken } from "@/lib/team/queries";

import { AcceptInviteForm } from "./accept-invite-form";
import { InviteSignInForm } from "./invite-sign-in-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Invitation invalide</h1>
        <p className="text-sm text-muted-foreground">
          Ce lien d&apos;invitation est invalide ou a expiré — demande à la personne qui t&apos;a
          invité de t&apos;en renvoyer un.
        </p>
      </div>
    );
  }

  const [profile, roleRows] = await Promise.all([
    getBusinessProfile(invite.accountId),
    db
      .select({ name: teamRoles.name })
      .from(teamMemberRoles)
      .innerJoin(teamRoles, eq(teamMemberRoles.roleId, teamRoles.id))
      .where(eq(teamMemberRoles.teamMemberId, invite.id)),
  ]);
  const businessName = profile.identity.businessName || "Scale X";
  const roleNames = roleRows.map((r) => r.name);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sessionEmail = (data?.claims?.email as string | undefined)?.toLowerCase();

  if (sessionEmail && sessionEmail === invite.email.toLowerCase()) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16 text-center">
        <div>
          <h1 className="text-2xl font-bold">Rejoindre {businessName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {roleNames.length > 0
              ? `Tu as été invité en tant que ${roleNames.join(", ")}.`
              : "Tu as été invité à rejoindre cette équipe."}
          </p>
        </div>
        <AcceptInviteForm token={token} />
      </div>
    );
  }

  if (sessionEmail) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Mauvais compte</h1>
        <p className="text-sm text-muted-foreground">
          Cette invitation est destinée à <strong>{invite.email}</strong>, mais tu es connecté avec{" "}
          {sessionEmail}. Déconnecte-toi puis reviens sur ce lien.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Rejoindre {businessName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {roleNames.length > 0
            ? `Invité en tant que ${roleNames.join(", ")}. Connecte-toi avec ${invite.email} pour accepter.`
            : `Connecte-toi avec ${invite.email} pour accepter.`}
        </p>
      </div>
      <InviteSignInForm email={invite.email} token={token} />
    </div>
  );
}
