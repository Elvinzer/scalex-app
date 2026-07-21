import { Falco } from "@/components/falco/falco";

import { CopiloteChatClient } from "./copilote-chat-client";

// A dedicated, more discoverable entry point into the same "Améliorer"
// chat (components/improve-chat.tsx) already reachable from the floating
// bubble (components/floating-chat-bubble.tsx) on every page — this page
// doesn't replace that bubble, it's additional. No PermissionKey: every
// account member sees "Copilote IA" in the nav (alwaysVisible, see
// components/app-sidebar.tsx) — app/(app)/layout.tsx's own auth guard
// already ensures a valid, non-lapsed account session before this renders.
export default function CopilotePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Falco pose="neutral" size="sm" animate="enter" className="hidden sm:flex" />
        <div>
          <h1 className="text-3xl font-bold">Copilote IA</h1>
          <p className="mt-1 text-muted-foreground">
            Discute de tes chiffres avec Falco — il connaît ton diagnostic et peut t&apos;aider à
            avancer sur ton goulot du moment.
          </p>
        </div>
      </div>
      <div className="h-[75vh] min-h-[520px] overflow-hidden rounded-2xl border-2 border-border">
        <CopiloteChatClient />
      </div>
    </div>
  );
}
