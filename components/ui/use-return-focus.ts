"use client";

import { useCallback, useRef } from "react";

export function useReturnFocus() {
  const originRef = useRef<HTMLElement | null>(null);

  const onOpenAutoFocus = useCallback(() => {
    const activeElement = document.activeElement;
    originRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : null;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    const returnTarget = originRef.current?.isConnected
      ? originRef.current
      : document.querySelector<HTMLElement>("main a[aria-current='page']");
    originRef.current = null;
    if (!returnTarget) return;
    event.preventDefault();
    returnTarget.focus({ preventScroll: true });
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus };
}
