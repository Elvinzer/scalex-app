import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getLocalSuperuserClaims } from "@/lib/auth/local-superuser-server";

export async function createClient() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't write cookies —
            // the middleware refreshes the session on the next request.
          }
        },
      },
    }
  );

  const localClaims = await getLocalSuperuserClaims();
  if (localClaims) {
    Object.defineProperty(supabase.auth, "getClaims", {
      configurable: true,
      value: async () => ({
        data: {
          claims: localClaims,
          header: { alg: "none", typ: "JWT" },
          signature: new Uint8Array(),
        },
        error: null,
      }),
    });
  }

  return supabase;
}
