"use client";

import { Component, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Scoped to the chat zone only (never the whole page) — a crash inside
// AgentChatThread (shared by the Copilote hub and the drawer) shows
// "Réessayer" in its own spot instead of taking down the agent panel/page
// around it. Class component because getDerivedStateFromError/
// componentDidCatch have no hook equivalent.
class ChatErrorBoundaryInner extends Component<{ children: ReactNode; errorText: string; retryText: string }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Chat panel crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">{this.props.errorText}</p>
          <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false })}>
            {this.props.retryText}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ChatErrorBoundary({ children }: { children: ReactNode }) {
  const t = useTranslations("common.shared");
  return <ChatErrorBoundaryInner errorText={t("chatError")} retryText={t("retry")} >{children}</ChatErrorBoundaryInner>;
}
