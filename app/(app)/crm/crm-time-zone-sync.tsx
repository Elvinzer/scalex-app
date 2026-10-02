"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CrmTimeZoneSync({ timeZone }: { timeZone: string }) {
  const router = useRouter();

  useEffect(() => {
    const target = new URL(window.location.href);
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (target.searchParams.get("tz") === browserTimeZone) return;

    target.searchParams.set("tz", browserTimeZone);
    router.replace(`${target.pathname}${target.search}`, { scroll: false });
  }, [router, timeZone]);

  return null;
}
