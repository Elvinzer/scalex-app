"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const isOpen = index === openIndex;
        return (
          <div key={item.q} className="border-b-2 border-ink py-6">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 text-left text-lg font-medium"
            >
              <span>{item.q}</span>
              <span className="shrink-0 text-xl" aria-hidden="true">
                {isOpen ? "–" : "+"}
              </span>
            </button>
            <p
              className={cn(
                "max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground",
                isOpen ? "mt-4" : "hidden"
              )}
            >
              {item.a}
            </p>
          </div>
        );
      })}
    </div>
  );
}
