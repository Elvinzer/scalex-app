import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ensureUserRow } from "@/lib/current-user";
import { crmExtensionCompletionPath, readCrmExtensionAuthQuery } from "@/lib/crm/extension-auth";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthDestination } from "@/lib/team/context";

import { PublicLocaleSwitcher } from "@/components/i18n/public-locale-switcher";
import { getRequestLocale } from "@/lib/i18n/locale";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in to Minaly",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; intent?: string; plan?: string; billing?: string; redirect_uri?: string; state?: string }>;
}) {
  const params = await searchParams;
  const extensionAuth = readCrmExtensionAuthQuery(new URLSearchParams({ redirect_uri: params.redirect_uri ?? "", state: params.state ?? "" }));
  const extensionCompletionPath = extensionAuth ? crmExtensionCompletionPath(extensionAuth) : null;
  const trialPlan = params.plan === "solo" || params.plan === "team" ? params.plan : "solo";
  const intent = params.intent === "trial" || params.intent === "diagnostic" ? params.intent : null;
  const billing = params.billing === "annual" ? "annual" : "monthly";
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
    if (intent === "trial") {
      redirect(`/api/billing/checkout?plan=${trialPlan}&trial=7&billing=${billing}`);
    }
    if (extensionCompletionPath) redirect(extensionCompletionPath);
    redirect(await getPostAuthDestination(userId));
  }

  const locale = await getRequestLocale();

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      {/* Top-right, minimal: needed so an English speaker can sign up, but it
          must never compete with the form itself (§C). */}
      <div className="absolute top-6 right-6">
        <PublicLocaleSwitcher current={locale} />
      </div>
      <SignInForm authCallbackError={params.error === "auth_callback"} intent={intent} plan={trialPlan} billing={billing} extensionCompletionPath={extensionCompletionPath} />
    </div>
  );
}
