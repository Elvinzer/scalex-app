"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_PAGES = 5;

// Centers a fixed-size window of page numbers on the current page instead of
// rendering one button per page — a creator with a long posting history can
// have dozens of pages, and an unbounded button row would wrap awkwardly.
function pageWindow(page: number, totalPages: number): number[] {
  const half = Math.floor(MAX_VISIBLE_PAGES / 2);
  const start = Math.max(1, Math.min(page - half, totalPages - MAX_VISIBLE_PAGES + 1));
  const end = Math.min(totalPages, start + MAX_VISIBLE_PAGES - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function Pager({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  const t = useTranslations("common.actions");
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Button type="button" variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={t("previousPage")}>
        <ChevronLeft className="size-3.5" />
      </Button>
      {pageWindow(page, totalPages).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPageChange(n)}
          aria-current={n === page ? "page" : undefined}
          className={cn(
            "flex size-7 items-center justify-center rounded-[var(--radius-control)] border text-sm font-bold transition-all",
            n === page ? "border-accent-border bg-accent-soft text-accent-text" : "border-border text-muted-foreground hover:border-border-hover"
          )}
        >
          {n}
        </button>
      ))}
      <Button type="button" variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label={t("nextPage")}>
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}
