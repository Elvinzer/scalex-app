"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { track } from "@/lib/analytics";
import { ensureUserRow } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { getInviteByToken } from "@/lib/team/queries";

export async function acceptInvite(token: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Connecte-toi d'abord pour accepter l'invitation." };
  }
  const userId = data.claims.sub as string;
  const email = (data.claims.email as string | undefined)?.toLowerCase();

  const invite = await getInviteByToken(token);
  if (!invite) {
    return { error: "Cette invitation est invalide ou a expiré." };
  }
  if (!email || invite.email.toLowerCase() !== email) {
    return { error: `Cette invitation est destinée à ${invite.email} — connecte-toi avec cette adresse.` };
  }

  await ensureUserRow(userId, email);

  await db
    .update(teamMembers)
    .set({ memberUserId: userId, status: "active", joinedAt: new Date(), inviteToken: null, inviteExpiresAt: null })
    .where(eq(teamMembers.id, invite.id));

  await track("team_invite_accepted", userId);

  return { error: null };
}
