import { AiChatPanel, type ChatMessage } from "@/components/ai-chat-panel";

export function AdCopyChat({ offerId, offerName }: { offerId: string | null; offerName: string | null }) {
  return (
    <AiChatPanel
      endpoint="/api/ad-copy-chat"
      buildRequestBody={(messages: ChatMessage[]) => ({ offerId, messages })}
      title={offerName ? `Rédiger une accroche : ${offerName}` : "Rédiger une accroche"}
      gapBadge={null}
    />
  );
}
