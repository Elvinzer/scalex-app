"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ImproveChat } from "@/components/improve-chat";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
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

  useEffect(() => {
    if (openParam && isMetricKey(openParam)) {
      setOpen(true);
      void recordImproveChatOpened(openParam);
    }
    // Only evaluated once on mount — this is a one-shot open, not a
    // reactive binding to the query param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!openParam || !isMetricKey(openParam)) return null;
  const metricKey = openParam;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        {open && (
          <ImproveChat metricKey={metricKey} period="3-months" title={labelFor(metricKey)} gapBadge={null} />
        )}
      </DrawerContent>
    </Drawer>
  );
}
