import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { ensureUserRow } from "@/lib/current-user";
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

  const email = data.claims.email;
  if (typeof email === "string") {
    await ensureUserRow(data.claims.sub as string, email);
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
