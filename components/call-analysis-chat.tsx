"use client";

import { AiChatPanel, type ChatMessage } from "@/components/ai-chat-panel";

export function CallAnalysisChat({ videoId, clientName }: { videoId: string; clientName: string }) {
  return (
    <AiChatPanel
      endpoint="/api/call-analysis-chat"
      buildRequestBody={(messages: ChatMessage[]) => ({ videoId, messages })}
      title={`Analyser l'appel : ${clientName}`}
      gapBadge={null}
    />
  );
}
