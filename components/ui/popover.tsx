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
          "sticker-card elevated z-50 w-72 p-4 text-sm duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
