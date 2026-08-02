import { HoverCard as RadixHoverCard } from "radix-ui";

import { cn } from "@/lib/utils";

// Minimal wrapper over the already-installed `radix-ui` package's HoverCard —
// no new dependency, same pattern as components/ui/popover.tsx.
export const HoverCard = RadixHoverCard.Root;
export const HoverCardTrigger = RadixHoverCard.Trigger;

export function HoverCardContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixHoverCard.Content>) {
  return (
    <RadixHoverCard.Portal>
      <RadixHoverCard.Content
        sideOffset={8}
        className={cn(
          "sticker-card elevated z-50 w-56 p-1.5 text-sm duration-[var(--motion-fast)] ease-[var(--ease-out)] focus:outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
      </RadixHoverCard.Content>
    </RadixHoverCard.Portal>
  );
}
