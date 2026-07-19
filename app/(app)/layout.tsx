import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/sign-in");
  }

  // No dedicated post-login step exists (the default Supabase email
  // template establishes the session client-side, not through a server
  // route we control) — ensured here instead, idempotent per request.
  const email = data.claims.email;
  if (typeof email === "string") {
    await db
      .insert(users)
      .values({ id: data.claims.sub as string, email })
      .onConflictDoNothing({ target: users.id });
  }

  return (
    <div className="flex min-h-screen bg-panel">
      <AppSidebar email={typeof email === "string" ? email : ""} />
      <main className="ml-64 flex-1 px-8 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <FloatingChatBubble />
    </div>
  );
}
