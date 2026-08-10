"use client";

import dynamic from "next/dynamic";

// ImproveChat includes the streaming thread, history actions and a sizeable
// drawer tree. Keep it out of the initial route chunk; every caller already
// renders it only when its drawer is open.
export const LazyImproveChat = dynamic(
  () => import("@/components/improve-chat").then((module) => module.ImproveChat),
  { ssr: false },
);
