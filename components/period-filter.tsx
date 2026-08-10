"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/period";

// Period selector — writes ?period=<key> to the URL so the server component
// recomputes KPIs and re-filters the table. Shared by the sales & calls views.
export function PeriodFilter({ current }: { current: PeriodKey }) {
  const t = useTranslations("common.period");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(key: PeriodKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div
      className={`inline-flex overflow-x-auto rounded-[var(--radius-control)] border border-border ${isPending ? "opacity-60" : ""}`}
    >
      {PERIOD_OPTIONS.map((o, i) => (
        <button
          key={o.key}
          type="button"
          onClick={() => select(o.key)}
          aria-pressed={current === o.key}
          disabled={isPending}
          className={`px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-colors ${
            i > 0 ? "border-l border-border" : ""
          } ${current === o.key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
        >
          {t(o.key)}
        </button>
      ))}
    </div>
  );
}
