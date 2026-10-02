"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function CrmTodayFilterLink({ href, active, className, children }: { href: string; active: boolean; className: string; children: ReactNode }) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();

    const target = new URL(href, window.location.origin);
    target.searchParams.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    router.push(`${target.pathname}${target.search}`);
  }

  return (
    <Button asChild variant="outline" className={className}>
      <Link href={href} onClick={handleClick} aria-current={active ? "page" : undefined}>{children}</Link>
    </Button>
  );
}
