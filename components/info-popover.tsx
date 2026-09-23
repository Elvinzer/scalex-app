import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Sibling of CalcPopover ("how is this calculated") and SourcePopover
// ("where does this come from") — this one answers the more general "what
// is this / why does it look this way," for labels and columns that need
// context but aren't strictly a calculation or a data-source explanation
// (e.g. "why is this always empty").
export function InfoPopover({ text, ariaLabel = "En savoir plus" }: { text: string; ariaLabel?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-signal focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-muted-foreground">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
