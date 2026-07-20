import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { isBusinessProfileThin } from "@/lib/business/thinness";
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

  // Runs on every navigation inside (app) — ensureUserRow (a write keyed
  // only on userId/email), getBusinessProfile, and the users row read are
  // all independent, so awaiting them one after another was a pure,
  // avoidable round-trip on literally every page change.
  const [, businessProfile, [userRow]] = await Promise.all([
    typeof email === "string" ? ensureUserRow(userId, email) : Promise.resolve(),
    getBusinessProfile(userId),
    db.select().from(users).where(eq(users.id, userId)).limit(1),
  ]);

  // Proactive "the AI has something to say" signal for the floating bubble
  // — true when the user has real business data to diagnose (not thin/empty)
  // but has never opened a conversation about any specific metric yet
  // (lastImproveMetricKey is only ever set by lib/improve-chat-tracking.ts,
  // when a metric-scoped chat is opened). A simple, no-new-schema proxy for
  // "there's a real bottleneck you haven't discussed with the AI" rather
  // than recomputing the full diagnostic cascade on every navigation.
  const hasUnseenInsight = !isBusinessProfileThin(businessProfile) && !userRow?.lastImproveMetricKey;

  return (
    <div className="flex min-h-screen bg-panel">
      <AppSidebar email={typeof email === "string" ? email : ""} businessName={businessProfile.identity.businessName} />
      <main className="ml-64 flex-1 px-8 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <FloatingChatBubble hasUnseenInsight={hasUnseenInsight} />
    </div>
  );
}
