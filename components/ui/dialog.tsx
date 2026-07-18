import { Dialog as RadixDialog } from "radix-ui";

import { cn } from "@/lib/utils";

// Minimal wrapper over the already-installed `radix-ui` package's Dialog —
// no new dependency. Escape/overlay-click-to-close is handled natively by
// Radix via onOpenChange; callers that need an unsaved-changes guard
// intercept that callback themselves rather than fighting the primitive.
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;
export const DialogTitle = RadixDialog.Title;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixDialog.Content>) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/50" />
      <RadixDialog.Content
        className={cn(
          "sticker-card fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 focus:outline-none",
          className
        )}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
