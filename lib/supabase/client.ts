import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function signOut() {
  const result = await createClient().auth.signOut();

  const hostname = window.location.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (process.env.NODE_ENV === "development" && isLocalhost) {
    try {
      await fetch("/api/auth/local/sign-out", {
        credentials: "same-origin",
        method: "POST",
      });
    } catch {
      // A local development sign-out should still complete if the cleanup request is interrupted.
    }
  }

  return result;
}
