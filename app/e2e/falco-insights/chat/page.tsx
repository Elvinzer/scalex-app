import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import { AgentChatThread } from "@/components/agent-chat-thread";
import type { ChatContext } from "@/lib/chat-context";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";

const conversationId = "00000000-0000-0000-0000-000000000001";

const context: ChatContext = {
  topicType: "metric",
  topicKey: "falco-quick-reply-qa",
  topicLabel: "Réponse rapide Falco",
  sourcePage: "e2e_falco_insights",
};

export default async function FalcoQuickReplyE2EPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "app"]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="min-h-screen bg-panel p-4 md:p-10">
        <div className="mx-auto flex h-[min(720px,calc(100vh-2rem))] max-w-2xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-background shadow-[var(--shadow-card)]">
          <header className="border-b border-border p-4">
            <p className="text-xs font-bold tracking-wide text-accent-2-text uppercase">Fixture locale uniquement</p>
            <h1 className="mt-1 text-xl font-bold">QA · personnalisation d&apos;une réponse rapide</h1>
            <p className="mt-1 text-sm text-muted-foreground">Le SSE est simulé par agent-browser ; le composer est le composant de production.</p>
          </header>
          <AgentChatThread context={context} period="current-month" conversationId={conversationId} conversationTitle="Réponse rapide Falco" />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
