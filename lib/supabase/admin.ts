import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/utils";

// Service-role client — bypasses RLS and can manage auth.users directly.
// NEVER imported from client code, NEVER logged. The only caller today is
// deleteAccount (app/(app)/settings/actions.ts), which needs
// auth.admin.deleteUser to remove the Supabase Auth identity itself — the
// regular clients (lib/supabase/client.ts, server.ts) only ever hold the
// anon key and can't do this.
let client: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
