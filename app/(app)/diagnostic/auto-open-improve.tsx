"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ImproveChat } from "@/components/improve-chat";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { labelFor } from "@/lib/diagnostic/cascade";
import { METRIC_KEYS, type MetricKey } from "@/lib/diagnostic/metric-keys";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";

function isMetricKey(value: string): value is MetricKey {
  return (METRIC_KEYS as string[]).includes(value);
}

// One-shot, URL-triggered drawer open for the onboarding screen 3 CTA
// ("Améliorer ça maintenant →" links to /diagnostic?open=<metricKey>) —
// deliberately NOT a persistent per-point button on this page (that was
// removed earlier in favor of the global floating chat bubble only).
export function AutoOpenImprove() {
  const searchParams = useSearchParams();
  const openParam = searchParams.get("open");
  const [open, setOpen] = useState(Boolean(openParam && isMetricKey(openParam)));

  const metricKey = openParam && isMetricKey(openParam) ? openParam : null;
  const context: ChatContext | null = metricKey
    ? { topicType: "metric", topicKey: metricKey, topicLabel: labelFor(metricKey), sourcePage: "diagnostic_deep_link" }
    : null;

  useEffect(() => {
    if (context) {
      setOpen(true);
      void recordImproveChatOpened(context);
    }
    // Only evaluated once on mount — this is a one-shot open, not a
    // reactive binding to the query param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!context) return null;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>{open && <ImproveChat context={context} period="3-months" gapBadge={null} />}</DrawerContent>
    </Drawer>
  );
}
