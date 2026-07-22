"use client";

import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Sibling of CalcPopover ("how is this calculated") — this one answers
// "where does this value come from," for fields auto-filled from another
// section (Setting/Closing daily entries) and disabled here to avoid
// double entry.
export function SourcePopover({ text, href, linkLabel }: { text: string; href?: string; linkLabel?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="D'où vient cette donnée"
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-signal"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-muted-foreground">{text}</p>
        {href && (
          <a href={href} className="mt-1 inline-block font-bold text-signal hover:underline">
            {linkLabel} →
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}
