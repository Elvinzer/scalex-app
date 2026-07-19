"use client";

import { useState } from "react";

import { ImproveChat } from "@/components/improve-chat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import type { ImproveMetricKey } from "@/lib/improve-prompt-builder";

type Period = "3-months" | "current-month" | "12-months";

export function ImproveButton({
  variant,
  metricKey,
  followupKey,
  label,
  currentRatePercent,
  benchmarkRatePercent,
  period,
}: {
  variant: "primary" | "secondary";
  metricKey: ImproveMetricKey;
  followupKey?: string | null;
  label: string;
  currentRatePercent?: number | null;
  benchmarkRatePercent?: number | null;
  period: Period;
}) {
  const [open, setOpen] = useState(false);

  const gapBadge =
    currentRatePercent !== undefined && currentRatePercent !== null && benchmarkRatePercent !== undefined && benchmarkRatePercent !== null
      ? `${currentRatePercent}% → objectif ${benchmarkRatePercent}%`
      : null;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant={variant === "primary" ? "default" : "outline"} size={variant === "primary" ? "default" : "sm"}>
          Améliorer →
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        {open && (
          <ImproveChat
            metricKey={metricKey}
            followupKey={followupKey}
            period={period}
            title={label}
            gapBadge={gapBadge}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
