"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type AdminNavLabels = {
  ariaLabel: string;
  dashboard: string;
  ideas: string;
  subscriptions: string;
  plans: string;
  referrals: string;
  support: string;
};

export function AdminNav({ labels }: { labels: AdminNavLabels }) {
  const pathname = usePathname();
  const items = [
    { href: "/admin", label: labels.dashboard },
    { href: "/admin/ideas", label: labels.ideas },
    { href: "/admin/subscriptions", label: labels.subscriptions },
    { href: "/admin/plans", label: labels.plans },
    { href: "/admin/referrals", label: labels.referrals },
    { href: "/admin/support", label: labels.support },
  ];

  return (
    <nav aria-label={labels.ariaLabel} className="mb-8 flex flex-wrap gap-2 border-b border-border pb-3">
      {items.map((item) => {
        const isActive = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-sm font-bold transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12",
              isActive
                ? "bg-accent-soft text-accent-text"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
