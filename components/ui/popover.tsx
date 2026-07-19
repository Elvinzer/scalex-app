import { Popover as RadixPopover } from "radix-ui";

import { cn } from "@/lib/utils";

// Minimal wrapper over the already-installed `radix-ui` package's Popover —
// no new dependency, same pattern as components/ui/dialog.tsx.
export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export function PopoverContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={8}
        className={cn(
          "sticker-card elevated z-50 w-72 p-4 text-sm transition-opacity duration-150 focus:outline-none",
          className
        )}
        {...props}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
