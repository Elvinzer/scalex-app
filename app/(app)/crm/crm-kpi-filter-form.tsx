"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ChangeEvent, type ReactNode } from "react";

const FILTER_FIELDS = ["team", "setter", "range", "from", "to", "platform", "offer", "source", "tz"] as const;

export function CrmKpiFilterForm({ children, className }: { children: ReactNode; className: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function updateFilters(event: ChangeEvent<HTMLFormElement>) {
    if (!(event.target instanceof HTMLSelectElement)) return;

    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams(searchParams.toString());
    for (const field of FILTER_FIELDS) {
      const value = formData.get(field);
      if (typeof value === "string" && value.length > 0) params.set(field, value);
      else params.delete(field);
    }

    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return <form method="get" onChange={updateFilters} className={className}>{children}</form>;
}
