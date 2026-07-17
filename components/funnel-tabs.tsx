"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/funnel", label: "Vue d'ensemble" },
  { href: "/funnel/setting", label: "Setting" },
  { href: "/funnel/closing", label: "Closing" },
] as const;

export function FunnelTabs() {
  const pathname = usePathname();

  return (
    <div className="flex w-fit gap-1.5 rounded-xl bg-paper-alt p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              active ? "bg-ink text-mist" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
