import { useTranslations } from "next-intl";

import { AiChatPanel, type ChatMessage } from "@/components/ai-chat-panel";

export function AdCopyChat({ offerId, offerName }: { offerId: string | null; offerName: string | null }) {
  const t = useTranslations("common.shared");
  return (
    <AiChatPanel
      endpoint="/api/ad-copy-chat"
      buildRequestBody={(messages: ChatMessage[]) => ({ offerId, messages })}
      title={offerName ? t("writeHookFor", { offer: offerName }) : t("writeHook")}
      gapBadge={null}
    />
  );
}
