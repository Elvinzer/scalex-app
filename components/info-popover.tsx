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
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-signal"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-muted-foreground">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
