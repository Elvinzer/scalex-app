"use client";

import { Route, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const DISMISS_KEY = "scalex:acquisition-funnel-inferred-dismissed";

type AcquisitionFunnelInferredBannerProps = {
  title: string;
  help: string;
  cta: string;
  dismiss: string;
};

export function AcquisitionFunnelInferredBanner({
  title,
  help,
  cta,
  dismiss: dismissLabel,
}: AcquisitionFunnelInferredBannerProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(window.localStorage.getItem(DISMISS_KEY) !== "1");
  }, []);

  if (!visible) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <aside className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-accent-border bg-accent-soft px-4 py-3 text-accent-text" role="status">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-border/45">
          <Route className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-accent-text/80">{help}</p>
          <Button asChild size="sm" className="mt-2">
            <Link href="/business#acquisition" prefetch>{cta}</Link>
          </Button>
        </div>
      </div>
      <button type="button" onClick={dismiss} className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] hover:bg-accent-border/30" aria-label={dismissLabel}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
