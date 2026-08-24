"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import { useTranslations } from "next-intl";

export const FalcoConversationEngagementContext = createContext<(() => void) | null>(null);

export function useFalcoConversationEngagement() {
  return useContext(FalcoConversationEngagementContext);
}

export function useFalcoConversationGuard() {
  const t = useTranslations("app.copilote.chat");
  const engagedRef = useRef(false);

  const reset = useCallback(() => {
    engagedRef.current = false;
  }, []);

  const markEngaged = useCallback(() => {
    engagedRef.current = true;
  }, []);

  const confirmClose = useCallback(() => {
    if (!engagedRef.current) return true;
    return window.confirm(t("leaveConfirmation"));
  }, [t]);

  return { confirmClose, markEngaged, reset };
}
