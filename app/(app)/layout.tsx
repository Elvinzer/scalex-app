import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { getBusinessProfile } from "@/lib/business/queries";
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
  const userId = data.claims.sub as string;
  if (typeof email === "string") {
    await ensureUserRow(userId, email);
  }

  const businessProfile = await getBusinessProfile(userId);

  return (
    <div className="flex min-h-screen bg-panel">
      <AppSidebar email={typeof email === "string" ? email : ""} businessName={businessProfile.identity.businessName} />
      <main className="ml-64 flex-1 px-8 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <FloatingChatBubble />
    </div>
  );
}
