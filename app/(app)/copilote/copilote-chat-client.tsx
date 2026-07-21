"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { ImproveChat } from "@/components/improve-chat";
import { Drawer } from "@/components/ui/drawer";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";

// ImproveChat internally uses DrawerTitle/DrawerClose (Radix Dialog.Title/
// Dialog.Close, see components/ui/drawer.tsx) which need a Dialog context to
// exist at all — so it's wrapped in a bare <Drawer> (Dialog.Root only, no
// <DrawerContent>/Portal/fixed positioning) rather than rendered raw. This
// keeps the page fully in-flow ("plein cadre", not an overlay) while giving
// the close (X) button inside ImproveChat's header a real action: back to
// the Dashboard, instead of a dead button with nothing to close.
export function CopiloteChatClient() {
  const router = useRouter();
  const hasRecordedRef = useRef(false);

  useEffect(() => {
    if (hasRecordedRef.current) return;
    hasRecordedRef.current = true;
    void recordImproveChatOpened("general");
  }, []);

  return (
    <Drawer open onOpenChange={(next) => { if (!next) router.push("/dashboard"); }}>
      <ImproveChat metricKey="general" period="3-months" title="Tes datas" gapBadge={null} />
    </Drawer>
  );
}
