import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_link", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_link", origin));
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.email) {
    await db
      .insert(users)
      .values({ id: userData.user.id, email: userData.user.email })
      .onConflictDoNothing({ target: users.id });
  }

  return NextResponse.redirect(new URL("/onboarding", origin));
}
