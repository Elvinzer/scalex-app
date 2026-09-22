"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ScaleScoreBadge } from "@/components/scale-score-badge";
import type { SidebarScaleScoreData } from "@/components/app-sidebar-with-scale-score";
import { loadSidebarScaleScore } from "@/lib/diagnostic/sidebar-scale-score-action";

export function LazySidebarScaleScore() {
  const pathname = usePathname();
  const [data, setData] = useState<SidebarScaleScoreData | null>(null);

  useEffect(() => {
    if (pathname === "/crm" || pathname.startsWith("/crm/")) {
      setData(null);
      return;
    }

    let cancelled = false;
    void loadSidebarScaleScore().then((nextData) => {
      if (!cancelled) setData(nextData);
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (pathname === "/crm" || pathname.startsWith("/crm/") || !data) return null;

  return (
    <div className="px-3 pt-4">
      <ScaleScoreBadge {...data} />
    </div>
  );
}
