import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureUserRow } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { getAccountContext } from "@/lib/team/context";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in to Scale X",
};

export default async function SignInPage() {
  // Un utilisateur déjà connecté qui atterrit sur /sign-in (session encore
  // valide) ne doit pas revoir le formulaire : on le renvoie directement dans
  // l'app. Même résolution de destination que app/auth/callback/route.ts.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    const userId = data.claims.sub as string;
    const email = data.claims.email;
    if (typeof email === "string") {
      await ensureUserRow(userId, email);
    }
    // Le statut d'onboarding suit le compte (owner) auquel l'utilisateur est
    // rattaché, pas sa propre ligne — cf. lib/current-user.ts.
    const context = await getAccountContext(userId);
    const accountId = context?.accountId ?? userId;
    const [user] = await db
      .select({ onboardingCompleted: users.onboardingCompleted })
      .from(users)
      .where(eq(users.id, accountId))
      .limit(1);
    redirect(user?.onboardingCompleted ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <SignInForm />
    </div>
  );
}
