import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // A team member accepting an invite never goes through the
  // business-owner onboarding wizard — see app/invite/[token]/page.tsx.
  const destination = inviteToken ? `/invite/${inviteToken}` : "/onboarding";
  return NextResponse.redirect(`${origin}${destination}`);
}
