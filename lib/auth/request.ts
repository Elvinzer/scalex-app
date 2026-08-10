import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type AuthIdentity = {
  userId: string;
  email: string | null;
};

// A single request can render the root layout, the authenticated layout and
// the page itself. All three need the same claims, so keep one request-scoped
// read instead of opening three Supabase auth lookups on every navigation.
export const getAuthIdentity = cache(async (): Promise<AuthIdentity | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;
  if (typeof userId !== "string") return null;

  return {
    userId,
    email: typeof claims?.email === "string" ? claims.email : null,
  };
});
