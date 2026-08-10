"use client";

import dynamic from "next/dynamic";
import { Flame } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { trackClient } from "@/lib/analytics-client";
import type { StreakSnapshot } from "@/lib/streak/service";
import { cn } from "@/lib/utils";

const StreakModal = dynamic(
  () => import("@/components/streak/streak-modal").then((module) => module.StreakModal),
  { ssr: false },
);

// Sits under ScaleScoreBadge in components/app-sidebar.tsx. Deliberately inert:
// no loop animation, no pulsing (§D). The flame is a readout the user glances
// at, not something competing for attention on every screen.
export function StreakBadge({ snapshot }: { snapshot: StreakSnapshot }) {
  const t = useTranslations("common.streak");
  const [open, setOpen] = useState(false);
  const lit = snapshot.current > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void trackClient("streak_modal_opened", { days: snapshot.current });
        }}
        aria-label={t("ariaLabel", { count: snapshot.current })}
        className="flex w-full min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors hover:bg-mist/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Flame className={cn("size-4 shrink-0", lit ? "text-accent" : "text-mist/35")} aria-hidden="true" />
        <span className={cn("text-sm font-bold tabular-nums", lit ? "text-mist" : "text-mist/45")}>
          {snapshot.current} j
        </span>
        <span className="ml-auto text-[11px] font-bold tabular-nums text-mist/45">
          {snapshot.weeklyDone}/{snapshot.weeklyGoal}
        </span>
      </button>

      <StreakModal open={open} onOpenChange={setOpen} snapshot={snapshot} />
    </>
  );
}
