"use client";

import { useEffect, useRef } from "react";

import { Drawer } from "@/components/ui/drawer";
import {
  FalcoConversationEngagementContext,
  useFalcoConversationGuard,
} from "@/components/use-falco-conversation-guard";

export function FalcoDrawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const { confirmClose, markEngaged, reset } = useFalcoConversationGuard();
  const previousOpenRef = useRef(open);

  useEffect(() => {
    if (open && !previousOpenRef.current) reset();
    previousOpenRef.current = open;
  }, [open, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      if (!confirmClose()) return;
      reset();
    } else {
      reset();
    }
    onOpenChange(next);
  }

  return (
    <FalcoConversationEngagementContext.Provider value={markEngaged}>
      <Drawer open={open} onOpenChange={handleOpenChange}>
        {children}
      </Drawer>
    </FalcoConversationEngagementContext.Provider>
  );
}
